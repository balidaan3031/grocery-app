/**
 * API contract types.
 *
 * These mirror `backend/src/types` — the two files are the seam between the app
 * and the API, so keep them in step when an endpoint changes shape.
 */

export type UserRole = 'admin' | 'staff';
export type MovementType = 'purchase' | 'sale' | 'adjustment' | 'return' | 'damage';
export type OrderStatus = 'pending' | 'completed' | 'cancelled' | 'refunded';
export type PaymentMethod = 'cash' | 'card' | 'upi' | 'other';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  tokenType: string;
}

export interface LoginResult {
  user: AuthUser;
  session: AuthSession;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  productCount?: number;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  barcode: string;
  sku: string;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
  purchase_price: number;
  selling_price: number;
  tax_rate: number;
  unit: string;
  image_url: string | null;
  low_stock_threshold: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  quantity: number;
  reserved: number;
  last_counted_at: string | null;
  stock_status: StockStatus;
  stock_retail_value: number;
  margin: number;
}

export interface CartItemProduct {
  id: string;
  name: string;
  barcode: string;
  sku: string;
  unit: string;
  image_url: string | null;
  selling_price: number;
  quantity: number;
  stock_status: StockStatus;
}

export interface CartItem {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  created_at: string;
  updated_at: string;
  product: CartItemProduct;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
}

export interface CartTotals {
  subtotal: number;
  taxAmount: number;
  total: number;
  itemCount: number;
  distinctItems: number;
}

export interface Cart {
  id: string;
  userId: string;
  status: string;
  items: CartItem[];
  totals: CartTotals;
  createdAt: string;
  updatedAt: string;
}

/** Response from POST /cart/items — the cart plus what the scan just did. */
export interface AddItemResult {
  cart: Cart;
  product: Product;
  wasAlreadyInCart: boolean;
  quantityInCart: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  barcode: string | null;
  sku: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  tax_amount: number;
  line_total: number;
  created_at: string;
}

export interface Payment {
  id: string;
  order_id: string;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  reference: string | null;
  paid_at: string | null;
}

export interface OrderSummary {
  id: string;
  order_number: string;
  user_id: string | null;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  item_count: number;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  cashier_name: string | null;
  cashier_email: string | null;
}

export interface Order extends OrderSummary {
  items: OrderItem[];
  payments: Payment[];
}

/** A stock ledger entry as stored — what a stock change answers with. */
export interface InventoryMovementRow {
  id: string;
  product_id: string;
  type: MovementType;
  quantity_change: number;
  previous_quantity: number;
  new_quantity: number;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_by: string | null;
  created_at: string;
}

/** The same entry joined for display, as the history endpoints return it. */
export interface InventoryMovement extends InventoryMovementRow {
  product_name: string;
  barcode: string;
  sku: string;
  unit: string;
  image_url: string | null;
  created_by_name: string | null;
}

export interface InventorySummary {
  totalProducts: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  totalUnits: number;
  retailValue: number;
  costValue: number;
}

export interface DashboardStats {
  todaySales: number;
  todayOrders: number;
  totalOrders: number;
  totalSales: number;
  totalProducts: number;
  totalCategories: number;
  lowStockCount: number;
  outOfStockCount: number;
  inventoryUnits: number;
  inventoryRetailValue: number;
  inventoryCostValue: number;
}

export interface SalesTrendPoint {
  day: string;
  total: number;
  orders: number;
}

export interface Dashboard {
  stats: DashboardStats;
  inventory: InventorySummary;
  recentOrders: OrderSummary[];
  lowStockProducts: Product[];
  salesTrend: SalesTrendPoint[];
  generatedAt: string;
}

export interface AppConfig {
  storeName: string;
  currencyCode: string;
  currencySymbol: string;
  supabaseUrl: string;
  storageBucket: string;
}

/** Payloads */
export interface ProductInput {
  name: string;
  description?: string | null;
  barcode: string;
  sku: string;
  categoryId?: string | null;
  purchasePrice: number;
  sellingPrice: number;
  taxRate: number;
  unit: string;
  imageUrl?: string | null;
  lowStockThreshold: number;
  initialQuantity?: number;
  allowBelowCost?: boolean;
  isActive?: boolean;
}

export interface CheckoutInput {
  paymentMethod: PaymentMethod;
  discountAmount?: number;
  customerName?: string | null;
  customerPhone?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
}

export interface StockAdjustInput {
  quantityChange: number;
  type: Exclude<MovementType, 'sale'>;
  reason?: string | null;
  /** Same key on a retry = applied once. */
  idempotencyKey?: string;
}

/** "The shelf holds N" — the server works out the change under lock. */
export interface StockCountInput {
  countedQuantity: number;
  reason?: string | null;
  idempotencyKey?: string;
}

export interface StockCountResult {
  changed: boolean;
  previousQuantity: number;
  newQuantity: number;
  /** Null when the count matched what was recorded. */
  movement: InventoryMovementRow | null;
  /** True when the server answered a retry with the original result. */
  replayed: boolean;
}

export interface ProductQuery {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  stockStatus?: StockStatus;
  /** Omitted means active only; `false` lists deactivated products. */
  isActive?: boolean;
  sortBy?: 'name' | 'created_at' | 'selling_price' | 'quantity';
  sortOrder?: 'asc' | 'desc';
}

export interface CategoryInput {
  name: string;
  description?: string | null;
  color: string;
  icon: string;
  isActive?: boolean;
}

export interface StaffCreateInput {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  phone?: string | null;
}

export interface StaffUpdateInput {
  fullName?: string;
  phone?: string | null;
  role?: UserRole;
}
