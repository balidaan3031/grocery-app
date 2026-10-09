import { supabaseAdmin } from '../config/supabase';
import { ApiError } from '../utils/ApiError';
import { toApiError, unwrap } from '../utils/supabaseError';
import { lineAmounts, round2 } from '../utils/money';
import { findProductByBarcode, getProductById } from './product.service';
import type { AddCartItemResult, CartDetail, CartItemDetail, Product } from '../types';
import type { AddCartItemInput } from '../validators/cart.validator';

/** The subset of a product a cart line needs to render. */
const toCartProduct = (product: Product): CartItemDetail['product'] => ({
  id: product.id,
  name: product.name,
  barcode: product.barcode,
  sku: product.sku,
  unit: product.unit,
  image_url: product.image_url,
  selling_price: product.selling_price,
  quantity: product.quantity,
  stock_status: product.stock_status,
});

export const getOrCreateActiveCartId = async (userId: string): Promise<string> => {
  const { data, error } = await supabaseAdmin.rpc('get_or_create_active_cart', {
    p_user_id: userId,
  });

  if (error) throw toApiError(error, 'Cart');
  if (!data) throw ApiError.internal('Could not open a cart');
  return data as string;
};

/**
 * Loads a cart with its lines.
 *
 * Items and products are fetched separately rather than as a PostgREST embed so
 * the product side can come from `products_with_stock` — that is what lets the
 * cart show live stock next to each line and warn before checkout fails.
 */
export const getCartDetail = async (cartId: string, userId: string): Promise<CartDetail> => {
  const cart = unwrap(
    await supabaseAdmin.from('carts').select('*').eq('id', cartId).eq('user_id', userId).single(),
    'Cart',
  );

  const items = unwrap(
    await supabaseAdmin
      .from('cart_items')
      .select('*')
      .eq('cart_id', cartId)
      .order('created_at', { ascending: true }),
    'Cart items',
  );

  const productIds = items.map((item) => item.product_id);
  const products = productIds.length
    ? unwrap(
        await supabaseAdmin.from('products_with_stock').select('*').in('id', productIds),
        'Products',
      )
    : [];

  const productById = new Map(products.map((product) => [product.id, product as Product]));

  const detailed: CartItemDetail[] = items.flatMap((item) => {
    const product = productById.get(item.product_id);
    // A product hard-deleted mid-session leaves a dangling line; skip it rather
    // than rendering a blank row the cashier cannot act on.
    if (!product) return [];

    const amounts = lineAmounts(item.unit_price, item.quantity, item.tax_rate);
    return [
      {
        ...item,
        product: toCartProduct(product),
        lineSubtotal: amounts.subtotal,
        lineTax: amounts.tax,
        lineTotal: amounts.total,
      },
    ];
  });

  const subtotal = round2(detailed.reduce((sum, item) => sum + item.lineSubtotal, 0));
  const taxAmount = round2(detailed.reduce((sum, item) => sum + item.lineTax, 0));

  return {
    id: cart.id,
    userId: cart.user_id,
    status: cart.status,
    items: detailed,
    totals: {
      subtotal,
      taxAmount,
      total: round2(subtotal + taxAmount),
      itemCount: detailed.reduce((sum, item) => sum + item.quantity, 0),
      distinctItems: detailed.length,
    },
    createdAt: cart.created_at,
    updatedAt: cart.updated_at,
  };
};

export const getActiveCart = async (userId: string): Promise<CartDetail> => {
  const cartId = await getOrCreateActiveCartId(userId);
  return getCartDetail(cartId, userId);
};

/** Guards against selling stock that is not there, with a message the cashier can act on. */
const assertStockAvailable = (product: Product, requestedTotal: number): void => {
  if (product.quantity <= 0) {
    throw ApiError.insufficientStock(`${product.name} is out of stock`, {
      productId: product.id,
      productName: product.name,
      available: 0,
      requested: requestedTotal,
    });
  }

  if (requestedTotal > product.quantity) {
    throw ApiError.insufficientStock(
      `Only ${product.quantity} ${product.unit} of ${product.name} left in stock`,
      {
        productId: product.id,
        productName: product.name,
        available: product.quantity,
        requested: requestedTotal,
      },
    );
  }
};

export interface AddItemResult {
  cart: CartDetail;
  product: Product;
  /** True when the scan bumped an existing line instead of creating one. */
  wasAlreadyInCart: boolean;
  quantityInCart: number;
}

/**
 * Adds a scanned or tapped product to the cart.
 *
 * Re-scanning the same item increments the existing line — the behaviour a
 * cashier expects when ringing up three identical yoghurts. The increment is a
 * single upsert inside `add_cart_item` (migration 0009): reading the line here
 * and writing it back raced when the same item was scanned twice in quick
 * succession, and the second scan failed on the unique index.
 *
 * `unit_price` and `tax_rate` are snapshotted onto the line: a price edit made
 * while a customer is at the till must not silently change what they were quoted.
 */
export const addItemToCart = async (
  userId: string,
  input: AddCartItemInput,
): Promise<AddItemResult> => {
  // Inactive products are included in the lookup on purpose: a deactivated
  // product still owns its barcode, so reporting it as unknown would send the
  // cashier to "add this product" and straight into a duplicate-barcode 409.
  const product = input.barcode
    ? await findProductByBarcode(input.barcode, { includeInactive: true })
    : await getProductById(input.productId as string);

  if (!product) {
    throw new ApiError(404, 'PRODUCT_NOT_FOUND', `No product matches barcode ${input.barcode}`, {
      barcode: input.barcode,
    });
  }

  if (!product.is_active) throw ApiError.productInactive(product, input.barcode);

  // Fails fast with the friendly message; the database re-checks the line total.
  assertStockAvailable(product, input.quantity);

  const { data, error } = await supabaseAdmin.rpc('add_cart_item', {
    p_user_id: userId,
    p_product_id: product.id,
    p_quantity: input.quantity,
  });

  if (error) throw toApiError(error, 'Cart item');
  const added = data as AddCartItemResult;

  return {
    cart: await getCartDetail(added.cartId, userId),
    product,
    wasAlreadyInCart: added.wasAlreadyInCart,
    quantityInCart: added.quantityInCart,
  };
};

const loadOwnedItem = async (userId: string, itemId: string) => {
  const item = unwrap(
    await supabaseAdmin.from('cart_items').select('*').eq('id', itemId).single(),
    'Cart item',
  );

  const cart = unwrap(
    await supabaseAdmin.from('carts').select('*').eq('id', item.cart_id).single(),
    'Cart',
  );

  // Answer 404 rather than 403: another user's cart item should not be
  // confirmable as existing at all.
  if (cart.user_id !== userId) throw ApiError.notFound('Cart item');
  if (cart.status !== 'active') throw ApiError.badRequest('This cart has already been checked out');

  return { item, cart };
};

export const updateCartItemQuantity = async (
  userId: string,
  itemId: string,
  quantity: number,
): Promise<CartDetail> => {
  const { item, cart } = await loadOwnedItem(userId, itemId);

  const product = await getProductById(item.product_id);
  assertStockAvailable(product, quantity);

  unwrap(
    await supabaseAdmin
      .from('cart_items')
      .update({ quantity })
      .eq('id', itemId)
      .select('id')
      .single(),
    'Cart item',
  );

  return getCartDetail(cart.id, userId);
};

export const removeCartItem = async (userId: string, itemId: string): Promise<CartDetail> => {
  const { cart } = await loadOwnedItem(userId, itemId);

  const { error } = await supabaseAdmin.from('cart_items').delete().eq('id', itemId);
  if (error) throw toApiError(error, 'Cart item');

  return getCartDetail(cart.id, userId);
};

export const clearCart = async (userId: string): Promise<CartDetail> => {
  const cartId = await getOrCreateActiveCartId(userId);

  const { error } = await supabaseAdmin.from('cart_items').delete().eq('cart_id', cartId);
  if (error) throw toApiError(error, 'Cart');

  return getCartDetail(cartId, userId);
};
