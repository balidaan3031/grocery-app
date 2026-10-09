import { z } from 'zod';
import { barcode, uuid } from './common.validator';

const quantity = z.coerce
  .number()
  .int('Quantity must be a whole number')
  .min(1, 'Quantity must be at least 1')
  .max(9999, 'Quantity is unrealistically large');

/**
 * A line can be added either by product id (tapped from a list) or by barcode
 * (scanned). Exactly one is required — accepting both would leave the server
 * guessing which one wins when they disagree.
 */
export const addCartItemSchema = {
  body: z
    .object({
      productId: uuid.optional(),
      barcode: barcode.optional(),
      quantity: quantity.default(1),
    })
    .refine((value) => Boolean(value.productId) !== Boolean(value.barcode), {
      message: 'Provide either productId or barcode, not both',
      path: ['productId'],
    }),
};

export const updateCartItemSchema = {
  params: z.object({ itemId: uuid }),
  body: z.object({ quantity }),
};

export const cartItemIdSchema = {
  params: z.object({ itemId: uuid }),
};

export type AddCartItemInput = z.infer<typeof addCartItemSchema.body>;
