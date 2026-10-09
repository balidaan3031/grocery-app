import type {
  CartItemRow,
  InventoryMovementDetailRow,
  OrderItemRow,
  OrderSummaryRow,
  PaymentRow,
  ProductWithStockRow,
  UserRole,
} from './database';

export * from './database';

/** Every successful response body has this envelope. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta & Record<string, unknown>;
}

/** Every failure has this one. `code` is stable; `message` is for humans. */
export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

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

/** The authenticated principal attached to every protected request. */
export interface AuthenticatedUser {
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
  user: AuthenticatedUser;
  session: AuthSession;
}

export type Product = ProductWithStockRow;

export interface CartItemDetail extends CartItemRow {
  product: Pick<
    ProductWithStockRow,
    'id' | 'name' | 'barcode' | 'sku' | 'unit' | 'image_url' | 'selling_price' | 'quantity' | 'stock_status'
  >;
  /** unit_price × quantity, before tax. */
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

export interface CartDetail {
  id: string;
  userId: string;
  status: string;
  items: CartItemDetail[];
  totals: CartTotals;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDetail extends OrderSummaryRow {
  items: OrderItemRow[];
  payments: PaymentRow[];
}

export type InventoryMovement = InventoryMovementDetailRow;
