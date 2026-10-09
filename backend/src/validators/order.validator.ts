import { z } from 'zod';
import { idParam, money, optionalText, paginationQuery, uuid } from './common.validator';

export const checkoutSchema = {
  body: z.object({
    /** Defaults to the caller's active cart when omitted. */
    cartId: uuid.optional(),
    paymentMethod: z.enum(['cash', 'card', 'upi', 'other']).default('cash'),
    discountAmount: money('Discount').default(0),
    customerName: optionalText(120).optional(),
    customerPhone: optionalText(32).optional(),
    /** UPI reference, card auth code, etc. */
    paymentReference: optionalText(120).optional(),
    notes: optionalText(500).optional(),
  }),
};

export const listOrdersSchema = {
  query: paginationQuery.extend({
    status: z.enum(['pending', 'completed', 'cancelled', 'refunded']).optional(),
    paymentMethod: z.enum(['cash', 'card', 'upi', 'other']).optional(),
    /** ISO dates; `to` is treated as inclusive of the whole day. */
    from: z.string().datetime({ offset: true }).or(z.coerce.date()).optional(),
    to: z.string().datetime({ offset: true }).or(z.coerce.date()).optional(),
    search: z.string().trim().max(60).optional(),
    /** Staff always see only their own orders; admins may opt into everyone's. */
    mine: z.enum(['true', 'false']).optional(),
  }),
};

export const orderIdSchema = { params: idParam };

export const dashboardSchema = {
  query: z.object({
    trendDays: z.coerce.number().int().min(1).max(90).default(7),
    recentLimit: z.coerce.number().int().min(1).max(20).default(5),
    lowStockLimit: z.coerce.number().int().min(1).max(20).default(5),
  }),
};

export type CheckoutInput = z.infer<typeof checkoutSchema.body>;
export type ListOrdersQuery = z.infer<typeof listOrdersSchema.query>;
