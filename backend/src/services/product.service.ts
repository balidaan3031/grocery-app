import { supabaseAdmin } from '../config/supabase';
import { logger } from '../config/logger';
import { ApiError } from '../utils/ApiError';
import { toApiError, unwrap } from '../utils/supabaseError';
import { buildMeta, pastLastPage, toRange } from '../utils/pagination';
import { barcodeKey, barcodeVariants } from '../utils/barcode';
import { adjustStock } from './inventory.service';
import type { Database, Paginated, Product } from '../types';
import type {
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from '../validators/product.validator';

/**
 * PostgREST parses `or=(...)` as a mini expression language, so a raw search
 * term containing a comma or parenthesis would change the meaning of the filter
 * rather than being matched literally. Stripping those characters (and the LIKE
 * wildcards) keeps a user's query as data.
 */
const sanitiseSearch = (term: string): string => term.replace(/[,()%\\*"]/g, ' ').trim();

type ProductInsert = Database['public']['Tables']['products']['Insert'];
type ProductUpdate = Database['public']['Tables']['products']['Update'];

const PRODUCT_COLUMNS = '*';

/** Reads always go through the view so callers get stock and category inline. */
const productsView = () => supabaseAdmin.from('products_with_stock');

export const listProducts = async (query: ListProductsQuery): Promise<Paginated<Product>> => {
  const { page, limit, search, categoryId, stockStatus, isActive, sortBy, sortOrder } = query;
  const { from, to } = toRange({ page, limit });

  let builder = productsView().select(PRODUCT_COLUMNS, { count: 'exact' });

  // Inactive products are hidden unless explicitly asked for — the till should
  // never surface a discontinued line by accident.
  builder = builder.eq('is_active', isActive ?? true);

  if (categoryId) builder = builder.eq('category_id', categoryId);
  if (stockStatus) builder = builder.eq('stock_status', stockStatus);

  if (search) {
    const term = sanitiseSearch(search);
    if (term) {
      builder = builder.or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`);
    }
  }

  const { data, error, count } = await builder
    .order(sortBy, { ascending: sortOrder === 'asc' })
    .order('id', { ascending: true }) // stable tiebreak so pages never overlap
    .range(from, to);

  if (error) {
    const empty = pastLastPage<Product>(error, { page, limit });
    if (empty) return empty;
    throw toApiError(error, 'Products');
  }

  return {
    items: (data ?? []) as Product[],
    meta: buildMeta({ page, limit }, count ?? 0),
  };
};

export const getProductById = async (id: string): Promise<Product> =>
  unwrap(await productsView().select(PRODUCT_COLUMNS).eq('id', id).single(), 'Product') as Product;

/**
 * Barcode lookup — the hot path for the scanner.
 *
 * Matches every way the same GTIN can be written (a UPC-A read as 12 digits on
 * Android and as a 13-digit EAN on iOS), so whichever form was saved is found.
 * The unique `barcode_key` index means at most one product can match; the exact
 * form is still preferred in case rows predate it.
 *
 * Returns `null` rather than throwing so the caller can distinguish "no such
 * product, offer to create it" from a genuine failure.
 */
export const findProductByBarcode = async (
  barcode: string,
  options: { includeInactive?: boolean } = {},
): Promise<Product | null> => {
  let builder = productsView().select(PRODUCT_COLUMNS).in('barcode', barcodeVariants(barcode));
  if (!options.includeInactive) builder = builder.eq('is_active', true);

  const { data, error } = await builder.limit(5);
  if (error) throw toApiError(error, 'Product');

  const matches = (data ?? []) as Product[];
  return matches.find((product) => product.barcode === barcode.trim()) ?? matches[0] ?? null;
};

/**
 * Refuses a barcode another product already owns, naming that product. The
 * unique index would refuse it anyway, but only with a bare "already exists" —
 * and when the owner is deactivated the fix is to restore it, not to recode.
 */
const assertBarcodeAvailable = async (barcode: string, exceptProductId?: string): Promise<void> => {
  const owner = await findProductByBarcode(barcode, { includeInactive: true });
  if (!owner || owner.id === exceptProductId) return;

  const sameCode = barcodeKey(owner.barcode) === barcodeKey(barcode) && owner.barcode !== barcode.trim();
  throw ApiError.conflict(
    `Barcode already belongs to "${owner.name}"${owner.is_active ? '' : ' (deactivated — restore it instead)'}` +
      (sameCode ? `, saved as ${owner.barcode}` : ''),
    { productId: owner.id, productName: owner.name, isActive: owner.is_active, barcode: owner.barcode },
  );
};

export const createProduct = async (
  input: CreateProductInput,
  userId: string,
): Promise<Product> => {
  await assertBarcodeAvailable(input.barcode);

  const insert: ProductInsert = {
    name: input.name,
    description: input.description ?? null,
    barcode: input.barcode,
    sku: input.sku,
    category_id: input.categoryId ?? null,
    purchase_price: input.purchasePrice,
    selling_price: input.sellingPrice,
    tax_rate: input.taxRate,
    unit: input.unit,
    image_url: input.imageUrl ?? null,
    low_stock_threshold: input.lowStockThreshold,
    is_active: true,
    created_by: userId,
  };

  const created = unwrap(await supabaseAdmin.from('products').insert(insert).select('*').single(), 'Product');

  // Opening stock is booked as a real `purchase` movement so the ledger explains
  // where the first units came from, instead of them appearing from nowhere.
  if (input.initialQuantity > 0) {
    try {
      await adjustStock({
        productId: created.id,
        quantityChange: input.initialQuantity,
        type: 'purchase',
        reason: 'Opening stock',
        userId,
      });
    } catch (error) {
      // Without this the product would stay behind with no stock, and the
      // caller's retry would then fail on its own barcode. It was created a
      // moment ago and has never been sold, so removing it is safe.
      const { error: rollbackError } = await supabaseAdmin.from('products').delete().eq('id', created.id);
      if (rollbackError) {
        logger.error(
          { err: rollbackError, productId: created.id },
          'Could not remove a product after its opening stock failed',
        );
      }
      throw error;
    }
  }

  return getProductById(created.id);
};

export const updateProduct = async (id: string, input: UpdateProductInput): Promise<Product> => {
  if (input.barcode !== undefined) await assertBarcodeAvailable(input.barcode, id);

  const patch: ProductUpdate = {};

  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description ?? null;
  if (input.barcode !== undefined) patch.barcode = input.barcode;
  if (input.sku !== undefined) patch.sku = input.sku;
  if (input.categoryId !== undefined) patch.category_id = input.categoryId ?? null;
  if (input.purchasePrice !== undefined) patch.purchase_price = input.purchasePrice;
  if (input.sellingPrice !== undefined) patch.selling_price = input.sellingPrice;
  if (input.taxRate !== undefined) patch.tax_rate = input.taxRate;
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl ?? null;
  if (input.lowStockThreshold !== undefined) patch.low_stock_threshold = input.lowStockThreshold;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  if (Object.keys(patch).length === 0) {
    throw ApiError.badRequest('Provide at least one field to update');
  }

  unwrap(await supabaseAdmin.from('products').update(patch).eq('id', id).select('id').single(), 'Product');

  return getProductById(id);
};

/**
 * Deactivation is the default because order history references products; a hard
 * delete would orphan receipts. `permanent` is allowed only while a product has
 * never been sold.
 */
export const deleteProduct = async (
  id: string,
  options: { permanent?: boolean } = {},
): Promise<{ deleted: boolean; product: Product | null }> => {
  if (!options.permanent) {
    const product = await updateProduct(id, { isActive: false });
    return { deleted: false, product };
  }

  const { count, error: countError } = await supabaseAdmin
    .from('order_items')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', id);

  if (countError) throw toApiError(countError, 'Order items');

  if ((count ?? 0) > 0) {
    throw ApiError.conflict(
      'This product appears on past orders and cannot be permanently deleted. Deactivate it instead.',
    );
  }

  const { error } = await supabaseAdmin.from('products').delete().eq('id', id);
  if (error) throw toApiError(error, 'Product');

  return { deleted: true, product: null };
};

export const restoreProduct = async (id: string): Promise<Product> =>
  updateProduct(id, { isActive: true });
