import { supabaseAdmin } from '../config/supabase';
import { ApiError } from '../utils/ApiError';
import { toApiError, unwrap } from '../utils/supabaseError';
import { buildMeta, pastLastPage, toRange } from '../utils/pagination';
import { getOrCreateActiveCartId } from './cart.service';
import type {
  AuthenticatedUser,
  OrderDetail,
  OrderItemRow,
  OrderSummaryRow,
  Paginated,
  PaymentRow,
} from '../types';
import type { CheckoutInput, ListOrdersQuery } from '../validators/order.validator';

/**
 * Completes a sale.
 *
 * Everything that must not half-happen — stock validation, the order, its line
 * items, the inventory deductions, the ledger entries, the payment record and
 * closing the cart — runs inside the `checkout_cart` database function as one
 * transaction. If a concurrent sale takes the last unit between the customer
 * scanning it and paying, the whole thing rolls back and the client gets a 409
 * naming the product, rather than an order that oversold the shelf.
 */
export const checkout = async (
  user: AuthenticatedUser,
  input: CheckoutInput,
): Promise<OrderDetail> => {
  const cartId = input.cartId ?? (await getOrCreateActiveCartId(user.id));

  const { data, error } = await supabaseAdmin.rpc('checkout_cart', {
    p_user_id: user.id,
    p_cart_id: cartId,
    p_payment_method: input.paymentMethod,
    p_discount_amount: input.discountAmount,
    p_customer_name: input.customerName ?? null,
    p_customer_phone: input.customerPhone ?? null,
    p_notes: input.notes ?? null,
    p_payment_reference: input.paymentReference ?? null,
  });

  if (error) throw toApiError(error, 'Cart');
  if (!data) throw ApiError.internal('Checkout did not return an order');

  return getOrderById(data as string, user);
};

/**
 * `to` arrives either as a full timestamp (used as given) or as a bare date,
 * which the validator coerces to that day's midnight. A bare date means the
 * whole of that day, so the range stops before the next midnight instead —
 * `<=` midnight left out every sale made on the day itself.
 */
const applyUpperBound = <
  B extends { lt: (column: string, value: string) => B; lte: (column: string, value: string) => B },
>(
  builder: B,
  toDate: string | Date,
): B => {
  if (typeof toDate === 'string') return builder.lte('created_at', new Date(toDate).toISOString());
  const nextDay = new Date(toDate.getTime() + 24 * 60 * 60 * 1000);
  return builder.lt('created_at', nextDay.toISOString());
};

/**
 * Staff are scoped to their own sales; admins see the whole store unless they
 * explicitly ask for just their own.
 */
const seesEveryOrder = (user: AuthenticatedUser, onlyMine: boolean): boolean =>
  user.role === 'admin' && !onlyMine;

export const listOrders = async (
  user: AuthenticatedUser,
  query: ListOrdersQuery,
): Promise<Paginated<OrderSummaryRow>> => {
  const { page, limit, status, paymentMethod, from: fromDate, to: toDate, search, mine } = query;
  const { from, to } = toRange({ page, limit });

  let builder = supabaseAdmin.from('order_summaries').select('*', { count: 'exact' });
  if (!seesEveryOrder(user, mine === 'true')) builder = builder.eq('user_id', user.id);

  if (status) builder = builder.eq('status', status);
  if (paymentMethod) builder = builder.eq('payment_method', paymentMethod);
  if (fromDate) builder = builder.gte('created_at', new Date(fromDate).toISOString());
  if (toDate) builder = applyUpperBound(builder, toDate);
  if (search) {
    // Same rule as product search: `"` would also be parsed as PostgREST syntax.
    const term = search.replace(/[,()%\\*"]/g, ' ').trim();
    if (term) {
      builder = builder.or(`order_number.ilike.%${term}%,customer_name.ilike.%${term}%`);
    }
  }

  const { data, error, count } = await builder
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to);

  if (error) {
    const empty = pastLastPage<OrderSummaryRow>(error, { page, limit });
    if (empty) return empty;
    throw toApiError(error, 'Orders');
  }

  return {
    items: (data ?? []) as OrderSummaryRow[],
    meta: buildMeta({ page, limit }, count ?? 0),
  };
};

export const getOrderById = async (id: string, user: AuthenticatedUser): Promise<OrderDetail> => {
  const order = unwrap(
    await supabaseAdmin.from('order_summaries').select('*').eq('id', id).single(),
    'Order',
  ) as OrderSummaryRow;

  if (user.role !== 'admin' && order.user_id !== user.id) {
    throw ApiError.notFound('Order');
  }

  const [items, payments] = await Promise.all([
    // Every line of a sale is written in the same transaction, so `created_at`
    // ties; the name (then id) keeps the receipt in one order every time it opens.
    supabaseAdmin
      .from('order_items')
      .select('*')
      .eq('order_id', id)
      .order('created_at')
      .order('product_name')
      .order('id'),
    supabaseAdmin.from('payments').select('*').eq('order_id', id).order('created_at').order('id'),
  ]);

  return {
    ...order,
    items: unwrap(items, 'Order items') as OrderItemRow[],
    payments: unwrap(payments, 'Payments') as PaymentRow[],
  };
};

export const getRecentOrders = async (
  user: AuthenticatedUser,
  limit: number,
): Promise<OrderSummaryRow[]> => {
  let builder = supabaseAdmin.from('order_summaries').select('*').eq('status', 'completed');
  if (!seesEveryOrder(user, false)) builder = builder.eq('user_id', user.id);

  const { data, error } = await builder
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw toApiError(error, 'Orders');
  return (data ?? []) as OrderSummaryRow[];
};
