import { supabaseAdmin } from '../config/supabase';
import { toApiError } from '../utils/supabaseError';
import { getLowStockProducts, getInventorySummary, type InventorySummary } from './inventory.service';
import { getRecentOrders } from './order.service';
import type {
  AuthenticatedUser,
  DashboardStats,
  OrderSummaryRow,
  Product,
  SalesTrendPoint,
} from '../types';

export interface DashboardPayload {
  stats: DashboardStats;
  inventory: InventorySummary;
  recentOrders: OrderSummaryRow[];
  lowStockProducts: Product[];
  salesTrend: SalesTrendPoint[];
  generatedAt: string;
}

/**
 * One endpoint for the whole home screen.
 *
 * The aggregate counters come from a single `dashboard_stats()` call rather than
 * a handful of round trips, and the remaining pieces are fetched concurrently —
 * the dashboard is the first thing loaded after sign-in, so its latency is the
 * app's perceived start-up time.
 */
export const getDashboard = async (
  user: AuthenticatedUser,
  options: { trendDays: number; recentLimit: number; lowStockLimit: number },
): Promise<DashboardPayload> => {
  const [statsResult, trendResult, inventory, recentOrders, lowStockProducts] = await Promise.all([
    supabaseAdmin.rpc('dashboard_stats'),
    supabaseAdmin.rpc('sales_trend', { p_days: options.trendDays }),
    getInventorySummary(),
    getRecentOrders(user, options.recentLimit),
    getLowStockProducts(options.lowStockLimit),
  ]);

  if (statsResult.error) throw toApiError(statsResult.error, 'Dashboard');
  if (trendResult.error) throw toApiError(trendResult.error, 'Sales trend');

  const stats = statsResult.data as unknown as DashboardStats;

  return {
    // Postgres numerics arrive as strings over JSON; coerce once here so every
    // consumer can rely on real numbers.
    stats: {
      ...stats,
      todaySales: Number(stats.todaySales),
      totalSales: Number(stats.totalSales),
      inventoryRetailValue: Number(stats.inventoryRetailValue),
      inventoryCostValue: Number(stats.inventoryCostValue),
    },
    inventory,
    recentOrders,
    lowStockProducts,
    salesTrend: ((trendResult.data ?? []) as SalesTrendPoint[]).map((point) => ({
      day: point.day,
      total: Number(point.total),
      orders: Number(point.orders),
    })),
    generatedAt: new Date().toISOString(),
  };
};
