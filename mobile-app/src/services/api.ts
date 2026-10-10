import { del, get, getList, patch, post } from './apiClient';
import type {
  AddItemResult,
  AppConfig,
  AuthUser,
  Cart,
  Category,
  CategoryInput,
  CheckoutInput,
  Dashboard,
  InventoryMovement,
  InventoryMovementRow,
  InventorySummary,
  LoginResult,
  Order,
  OrderSummary,
  PaginationMeta,
  Product,
  ProductInput,
  ProductQuery,
  StaffCreateInput,
  StaffUpdateInput,
  StockAdjustInput,
  StockCountInput,
  StockCountResult,
  StockStatus,
} from '../types';

/**
 * The API surface, grouped by resource.
 *
 * Screens and stores call these; nothing else knows a URL. Keeping the paths in
 * one file means an endpoint rename is a single edit rather than a search.
 */

export const authApi = {
  login: (email: string, password: string) =>
    post<LoginResult>('/auth/login', { email, password }),

  logout: () => post<void>('/auth/logout'),

  me: () => get<AuthUser>('/auth/me'),

  updateProfile: (input: { fullName?: string; phone?: string | null; avatarUrl?: string | null }) =>
    patch<AuthUser>('/auth/me', input),

  changePassword: (currentPassword: string, newPassword: string) =>
    post<void>('/auth/me/password', { currentPassword, newPassword }),
};

/** Store accounts. Every call is admin-only server-side. */
export const staffApi = {
  list: () => get<AuthUser[]>('/auth/users'),

  create: (input: StaffCreateInput) => post<AuthUser>('/auth/users', input),

  update: (id: string, input: StaffUpdateInput) => patch<AuthUser>(`/auth/users/${id}`, input),

  setActive: (id: string, isActive: boolean) =>
    patch<AuthUser>(`/auth/users/${id}/status`, { isActive }),

  resetPassword: (id: string, password: string) =>
    post<void>(`/auth/users/${id}/password`, { password }),
};

export const configApi = {
  get: () => get<AppConfig>('/config'),
};

export const dashboardApi = {
  overview: (params?: { trendDays?: number; recentLimit?: number; lowStockLimit?: number }) =>
    get<Dashboard>('/dashboard', params),
};

export const productsApi = {
  list: (query: ProductQuery = {}) =>
    getList<Product>('/products', query as Record<string, unknown>),

  byId: (id: string) => get<Product>(`/products/${id}`),

  /** The scanner's lookup. A miss rejects with code PRODUCT_NOT_FOUND. */
  byBarcode: (barcode: string) => get<Product>(`/products/barcode/${encodeURIComponent(barcode)}`),

  create: (input: ProductInput) => post<Product>('/products', input),

  update: (id: string, input: Partial<ProductInput>) => patch<Product>(`/products/${id}`, input),

  deactivate: (id: string) => del<{ deleted: boolean; product: Product | null }>(`/products/${id}`),

  restore: (id: string) => post<Product>(`/products/${id}/restore`),

  movements: (id: string) => get<InventoryMovement[]>(`/products/${id}/movements`),
};

export const categoriesApi = {
  list: (params?: { includeInactive?: boolean; withCounts?: boolean }) =>
    get<Category[]>('/categories', params),

  create: (input: CategoryInput) => post<Category>('/categories', input),

  update: (id: string, input: Partial<CategoryInput>) => patch<Category>(`/categories/${id}`, input),

  remove: (id: string) => del<void>(`/categories/${id}`),
};

export const cartApi = {
  get: () => get<Cart>('/cart'),

  addByBarcode: (barcode: string, quantity = 1) =>
    post<AddItemResult>('/cart/items', { barcode, quantity }),

  addByProduct: (productId: string, quantity = 1) =>
    post<AddItemResult>('/cart/items', { productId, quantity }),

  setQuantity: (itemId: string, quantity: number) =>
    patch<Cart>(`/cart/items/${itemId}`, { quantity }),

  removeItem: (itemId: string) => del<Cart>(`/cart/items/${itemId}`),

  clear: () => del<Cart>('/cart'),
};

export const ordersApi = {
  checkout: (input: CheckoutInput) => post<Order>('/orders/checkout', input),

  list: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    paymentMethod?: string;
    search?: string;
    mine?: 'true' | 'false';
  }) => getList<OrderSummary>('/orders', params),

  byId: (id: string) => get<Order>(`/orders/${id}`),
};

export const inventoryApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    categoryId?: string;
    stockStatus?: StockStatus;
    sortBy?: 'name' | 'quantity' | 'updated_at';
    sortOrder?: 'asc' | 'desc';
  }) => getList<Product>('/inventory', params),

  summary: () => get<InventorySummary>('/inventory/summary'),

  lowStock: (limit = 20) => get<Product[]>('/inventory/low-stock', { limit }),

  adjust: (productId: string, input: StockAdjustInput) =>
    post<InventoryMovementRow>(`/inventory/${productId}/adjust`, input),

  /** Sets stock to a physical count; the server computes the change atomically. */
  count: (productId: string, input: StockCountInput) =>
    post<StockCountResult>(`/inventory/${productId}/count`, input),

  movements: (params?: {
    page?: number;
    limit?: number;
    productId?: string;
    type?: string;
  }) => getList<InventoryMovement>('/inventory/movements', params),

  productMovements: (productId: string) =>
    get<InventoryMovement[]>(`/inventory/${productId}/movements`),
};

export type { PaginationMeta };
