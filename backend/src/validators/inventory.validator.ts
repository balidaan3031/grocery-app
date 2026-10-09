import { z } from 'zod';
import { idempotencyKey, optionalText, paginationQuery, uuid, wholeNumber } from './common.validator';

const MOVEMENT_TYPES = ['purchase', 'sale', 'adjustment', 'return', 'damage'] as const;

/** Types whose direction is fixed; `adjustment` may go either way. */
const ADDS_STOCK = new Set(['purchase', 'return']);
const REMOVES_STOCK = new Set(['damage']);

/**
 * A signed delta: the ledger records what changed. For "the shelf holds N",
 * use the count endpoint instead — a delta worked out on the phone is based on
 * whatever the screen loaded, not on the stock at the moment of saving.
 *
 * `sale` is excluded — those rows are written by checkout alone, so allowing one
 * here would let stock leave without an order behind it. The database enforces
 * the same direction rules (migration 0009); checking here gives a field error.
 */
export const adjustStockSchema = {
  params: z.object({ productId: uuid }),
  body: z
    .object({
      quantityChange: z.coerce
        .number()
        .int('Change must be a whole number')
        .refine((value) => value !== 0, 'Change must not be zero')
        .refine((value) => Math.abs(value) <= 1_000_000, 'Change is unrealistically large'),
      type: z.enum(['purchase', 'adjustment', 'return', 'damage']).default('adjustment'),
      reason: optionalText(240).optional(),
      idempotencyKey: idempotencyKey.optional(),
    })
    .superRefine((value, ctx) => {
      if (ADDS_STOCK.has(value.type) && value.quantityChange < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['quantityChange'],
          message: `A ${value.type} can only add stock`,
        });
      }
      if (REMOVES_STOCK.has(value.type) && value.quantityChange > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['quantityChange'],
          message: `A ${value.type} can only remove stock`,
        });
      }
    }),
};

/**
 * A stock count: the quantity physically on the shelf. The server turns it into
 * a delta under the row lock and records it as an `adjustment`.
 */
export const countStockSchema = {
  params: z.object({ productId: uuid }),
  body: z.object({
    countedQuantity: wholeNumber('Counted quantity', 1_000_000),
    reason: optionalText(240).optional(),
    idempotencyKey: idempotencyKey.optional(),
  }),
};

export const listInventorySchema = {
  query: paginationQuery.extend({
    search: z.string().trim().max(120).optional(),
    categoryId: uuid.optional(),
    stockStatus: z.enum(['in_stock', 'low_stock', 'out_of_stock']).optional(),
    sortBy: z.enum(['name', 'quantity', 'updated_at']).default('quantity'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
  }),
};

export const listMovementsSchema = {
  query: paginationQuery
    .extend({
      productId: uuid.optional(),
      type: z.enum(MOVEMENT_TYPES).optional(),
      from: z.string().datetime({ offset: true }).or(z.coerce.date()).optional(),
      to: z.string().datetime({ offset: true }).or(z.coerce.date()).optional(),
    })
    .refine(
      (value) => !value.from || !value.to || new Date(value.from) <= new Date(value.to),
      { message: '`from` must not be after `to`', path: ['from'] },
    ),
};

export const lowStockSchema = {
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
};

export const productIdParamSchema = {
  params: z.object({ productId: uuid }),
};

export type AdjustStockInput = z.infer<typeof adjustStockSchema.body>;
export type CountStockInput = z.infer<typeof countStockSchema.body>;
export type ListInventoryQuery = z.infer<typeof listInventorySchema.query>;
export type ListMovementsQuery = z.infer<typeof listMovementsSchema.query>;
