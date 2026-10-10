/**
 * Typed shape of the Supabase schema, mirroring supabase/migrations.
 *
 * Hand-maintained rather than generated so the repo stays runnable without the
 * Supabase CLI. If you do have the CLI, this file is a drop-in replacement for
 *   supabase gen types typescript --project-id <id> > src/types/database.ts
 * Keep it in step with the migrations — it is what makes `.from()` / `.rpc()`
 * calls typecheck.
 */

export type UserRole = 'admin' | 'staff';
export type MovementType = 'purchase' | 'sale' | 'adjustment' | 'return' | 'damage';
export type CartStatus = 'active' | 'converted' | 'abandoned';
export type OrderStatus = 'pending' | 'completed' | 'cancelled' | 'refunded';
export type PaymentMethod = 'cash' | 'card' | 'upi' | 'other';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export type UserRow = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  barcode: string;
  /** Generated: GTINs padded to 14 digits, so one product owns every format of its code. */
  barcode_key: string;
  sku: string;
  category_id: string | null;
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
};

export type InventoryRow = {
  id: string;
  product_id: string;
  quantity: number;
  reserved: number;
  last_counted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryMovementRow = {
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
};

export type CartRow = {
  id: string;
  user_id: string;
  status: CartStatus;
  created_at: string;
  updated_at: string;
};

export type CartItemRow = {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  created_at: string;
  updated_at: string;
};

export type OrderRow = {
  id: string;
  order_number: string;
  user_id: string | null;
  cart_id: string | null;
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
};

export type OrderItemRow = {
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
};

export type PaymentRow = {
  id: string;
  order_id: string;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  reference: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

/** public.inventory_request_keys · one row per idempotent stock request */
export type InventoryRequestKeyRow = {
  key: string;
  operation: 'adjust' | 'count';
  product_id: string;
  movement_type: MovementType;
  quantity: number;
  movement_id: string | null;
  previous_quantity: number;
  new_quantity: number;
  created_by: string | null;
  created_at: string;
};

/** public.products_with_stock — the view does not expose `barcode_key`. */
export type ProductWithStockRow = Omit<ProductRow, 'barcode_key'> & {
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
  quantity: number;
  reserved: number;
  last_counted_at: string | null;
  stock_status: StockStatus;
  stock_retail_value: number;
  margin: number;
};

/** public.inventory_levels (0010) — the same, plus when the stock last changed. */
export type InventoryLevelRow = ProductWithStockRow & {
  stock_updated_at: string | null;
};

/** public.inventory_movement_details */
export type InventoryMovementDetailRow = InventoryMovementRow & {
  product_name: string;
  barcode: string;
  sku: string;
  unit: string;
  image_url: string | null;
  created_by_name: string | null;
};

/** public.order_summaries */
export type OrderSummaryRow = OrderRow & {
  cashier_name: string | null;
  cashier_email: string | null;
};

/** Insert/Update helpers: generated columns are never client-supplied. */
type Generated = 'id' | 'created_at' | 'updated_at';
type Insert<T, R extends keyof T = never> = Omit<T, Generated | R> &
  Partial<Pick<T, Extract<Generated, keyof T>>>;
type Update<T> = Partial<Omit<T, 'id' | 'created_at'>>;

type Table<Row, I = Insert<Row>, U = Update<Row>> = {
  Row: Row;
  Insert: I;
  Update: U;
  Relationships: [];
};

type View<Row> = {
  Row: Row;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      users: Table<UserRow, Omit<UserRow, 'created_at' | 'updated_at'>>;
      categories: Table<CategoryRow>;
      products: Table<
        ProductRow,
        Insert<ProductRow, 'barcode_key'>,
        Partial<Omit<ProductRow, 'id' | 'created_at' | 'barcode_key'>>
      >;
      inventory_request_keys: Table<InventoryRequestKeyRow>;
      inventory: Table<InventoryRow>;
      inventory_movements: Table<InventoryMovementRow>;
      carts: Table<CartRow>;
      cart_items: Table<CartItemRow>;
      orders: Table<OrderRow>;
      order_items: Table<OrderItemRow>;
      payments: Table<PaymentRow>;
    };
    Views: {
      products_with_stock: View<ProductWithStockRow>;
      low_stock_products: View<ProductWithStockRow>;
      inventory_levels: View<InventoryLevelRow>;
      inventory_movement_details: View<InventoryMovementDetailRow>;
      order_summaries: View<OrderSummaryRow>;
    };
    Functions: {
      adjust_inventory: {
        Args: {
          p_product_id: string;
          p_quantity_change: number;
          p_type: MovementType;
          p_reason?: string | null;
          p_user_id?: string | null;
          p_reference_type?: string | null;
          p_reference_id?: string | null;
          p_idempotency_key?: string | null;
        };
        Returns: InventoryMovementRow;
      };
      set_inventory_count: {
        Args: {
          p_product_id: string;
          p_counted_quantity: number;
          p_reason?: string | null;
          p_user_id?: string | null;
          p_idempotency_key?: string | null;
        };
        Returns: InventoryCountResult;
      };
      add_cart_item: {
        Args: { p_user_id: string; p_product_id: string; p_quantity: number };
        Returns: AddCartItemResult;
      };
      inventory_summary: {
        Args: Record<string, never>;
        Returns: InventorySummaryStats;
      };
      barcode_key: {
        Args: { p_barcode: string };
        Returns: string;
      };
      get_or_create_active_cart: {
        Args: { p_user_id: string };
        Returns: string;
      };
      checkout_cart: {
        Args: {
          p_user_id: string;
          p_cart_id: string;
          p_payment_method?: PaymentMethod;
          p_discount_amount?: number;
          p_customer_name?: string | null;
          p_customer_phone?: string | null;
          p_notes?: string | null;
          p_payment_reference?: string | null;
        };
        Returns: string;
      };
      dashboard_stats: {
        Args: Record<string, never>;
        Returns: DashboardStats;
      };
      sales_trend: {
        Args: { p_days?: number };
        Returns: SalesTrendPoint[];
      };
    };
    Enums: {
      user_role: UserRole;
      movement_type: MovementType;
      cart_status: CartStatus;
      order_status: OrderStatus;
      payment_method: PaymentMethod;
      payment_status: PaymentStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type DashboardStats = {
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
};

export type SalesTrendPoint = {
  day: string;
  total: number;
  orders: number;
};

/** set_inventory_count(): `movement` is null when the count matched the shelf. */
export type InventoryCountResult = {
  changed: boolean;
  previousQuantity: number;
  newQuantity: number;
  movement: InventoryMovementRow | null;
  /** True when an idempotency key answered with the earlier result. */
  replayed: boolean;
};

export type AddCartItemResult = {
  cartId: string;
  quantityInCart: number;
  wasAlreadyInCart: boolean;
};

export type InventorySummaryStats = {
  totalProducts: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  totalUnits: number;
  retailValue: number;
  costValue: number;
};
