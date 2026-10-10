import { supabaseAdmin } from '../config/supabase';
import { toApiError } from '../utils/supabaseError';
import { buildMeta, pastLastPage, toRange } from '../utils/pagination';
import type {
  InventoryCountResult,
  InventoryMovement,
  InventoryMovementRow,
  InventorySummaryStats,
  MovementType,
  Paginated,
  Product,
} from '../types';
import type { ListInventoryQuery, ListMovementsQuery } from '../validators/inventory.validator';

/** See product.service: keeps a search term from being parsed as PostgREST syntax. */
const sanitiseSearch = (term: string): string => term.replace(/[,()%\\*"]/g, ' ').trim();

export interface AdjustStockArgs {
  productId: string;
  quantityChange: number;
  type: MovementType;
  reason?: string | null;
  userId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  /** Makes a retried request apply once; see migration 0009. */
  idempotencyKey?: string | null;
}

/**
 * Every stock change in the system funnels through here.
 *
 * The work happens inside the `adjust_inventory` database function, which locks
 * the row, applies the delta and writes the ledger entry in one transaction.
 * Doing the read-modify-write in Node instead would let two concurrent
 * adjustments overwrite each other.
 */
export const adjustStock = async (args: AdjustStockArgs): Promise<InventoryMovementRow> => {
  const { data, error } = await supabaseAdmin.rpc('adjust_inventory', {
    p_product_id: args.productId,
    p_quantity_change: args.quantityChange,
    p_type: args.type,
    p_reason: args.reason ?? null,
    p_user_id: args.userId ?? null,
    p_reference_type: args.referenceType ?? null,
    p_reference_id: args.referenceId ?? null,
    p_idempotency_key: args.idempotencyKey ?? null,
  });

  if (error) throw toApiError(error, 'Inventory');
  return data as InventoryMovementRow;
};

export interface CountStockArgs {
  productId: string;
  countedQuantity: number;
  reason?: string | null;
  userId?: string | null;
  idempotencyKey?: string | null;
}

/**
 * A stock count: "the shelf holds N". The delta is computed in the database
 * while the row is locked, so a sale made between opening the count and saving
 * it is not undone by the correction.
 */
export const countStock = async (args: CountStockArgs): Promise<InventoryCountResult> => {
  const { data, error } = await supabaseAdmin.rpc('set_inventory_count', {
    p_product_id: args.productId,
    p_counted_quantity: args.countedQuantity,
    p_reason: args.reason ?? null,
    p_user_id: args.userId ?? null,
    p_idempotency_key: args.idempotencyKey ?? null,
  });

  if (error) throw toApiError(error, 'Inventory');
  return data as InventoryCountResult;
};

/** Stock list. Shares the product view, so the shapes match what the UI already renders. */
export const listInventory = async (query: ListInventoryQuery): Promise<Paginated<Product>> => {
  const { page, limit, search, categoryId, stockStatus, sortBy, sortOrder } = query;
  const { from, to } = toRange({ page, limit });

  // "Recent" means stock that changed recently: the inventory row's timestamp
  // from inventory_levels (0010), not the product's own `updated_at`, which
  // only moves when the catalogue entry is edited. The other sorts read the
  // base view, so they keep working on a database 0010 has not reached yet.
  const recent = sortBy === 'updated_at';

  let builder = supabaseAdmin
    .from(recent ? 'inventory_levels' : 'products_with_stock')
    .select('*', { count: 'exact' })
    .eq('is_active', true);

  if (categoryId) builder = builder.eq('category_id', categoryId);
  if (stockStatus) builder = builder.eq('stock_status', stockStatus);

  if (search) {
    const term = sanitiseSearch(search);
    if (term) {
      builder = builder.or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`);
    }
  }

  const { data, error, count } = await builder
    .order(recent ? 'stock_updated_at' : sortBy, { ascending: sortOrder === 'asc', nullsFirst: false })
    .order('id', { ascending: true })
    .range(from, to);

  if (error) {
    const empty = pastLastPage<Product>(error, { page, limit });
    if (empty) return empty;
    throw toApiError(error, 'Inventory');
  }

  return { items: (data ?? []) as Product[], meta: buildMeta({ page, limit }, count ?? 0) };
};

/** Restock worklist: out-of-stock first, then closest to the threshold. */
export const getLowStockProducts = async (limit: number): Promise<Product[]> => {
  const { data, error } = await supabaseAdmin
    .from('low_stock_products')
    .select('*')
    .limit(limit);

  if (error) throw toApiError(error, 'Low stock products');
  return (data ?? []) as Product[];
};

export const listMovements = async (
  query: ListMovementsQuery,
): Promise<Paginated<InventoryMovement>> => {
  const { page, limit, productId, type, from: fromDate, to: toDate } = query;
  const { from, to } = toRange({ page, limit });

  let builder = supabaseAdmin
    .from('inventory_movement_details')
    .select('*', { count: 'exact' });

  if (productId) builder = builder.eq('product_id', productId);
  if (type) builder = builder.eq('type', type);
  if (fromDate) builder = builder.gte('created_at', new Date(fromDate).toISOString());
  if (toDate) builder = builder.lte('created_at', new Date(toDate).toISOString());

  const { data, error, count } = await builder
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to);

  if (error) {
    const empty = pastLastPage<InventoryMovement>(error, { page, limit });
    if (empty) return empty;
    throw toApiError(error, 'Inventory movements');
  }

  return {
    items: (data ?? []) as InventoryMovement[],
    meta: buildMeta({ page, limit }, count ?? 0),
  };
};

/** Movement history for one product, newest first. */
export const getProductMovements = async (
  productId: string,
  limit = 50,
): Promise<InventoryMovement[]> => {
  const { data, error } = await supabaseAdmin
    .from('inventory_movement_details')
    .select('*')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw toApiError(error, 'Inventory movements');
  return (data ?? []) as InventoryMovement[];
};

export type InventorySummary = InventorySummaryStats;

/**
 * One aggregate in the database. Summing in Node meant fetching every product
 * row, and PostgREST caps a response at 1000 rows — past that the totals were
 * silently short. One query is also one snapshot, so the counts always agree.
 */
export const getInventorySummary = async (): Promise<InventorySummary> => {
  const { data, error } = await supabaseAdmin.rpc('inventory_summary');
  if (error) throw toApiError(error, 'Inventory');

  const stats = data as InventorySummaryStats;
  return {
    totalProducts: Number(stats.totalProducts),
    inStock: Number(stats.inStock),
    lowStock: Number(stats.lowStock),
    outOfStock: Number(stats.outOfStock),
    totalUnits: Number(stats.totalUnits),
    retailValue: Number(stats.retailValue),
    costValue: Number(stats.costValue),
  };
};
