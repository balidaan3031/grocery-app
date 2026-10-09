import { z } from 'zod';
import {
  barcode,
  booleanQuery,
  catalogueBarcode,
  idParam,
  money,
  optionalText,
  paginationQuery,
  text,
  uuid,
  wholeNumber,
} from './common.validator';

const productBody = z.object({
  name: text(160, 'Product name'),
  description: optionalText(2000).optional(),
  barcode: catalogueBarcode,
  sku: text(64, 'SKU').regex(/^[A-Za-z0-9\-_]+$/, 'SKU may only contain letters, numbers, dash or underscore'),
  categoryId: uuid.nullish(),
  purchasePrice: money('Purchase price').default(0),
  sellingPrice: money('Selling price'),
  taxRate: z.coerce.number().min(0).max(100, 'Tax rate must be between 0 and 100').default(0),
  unit: text(16, 'Unit').default('pcs'),
  imageUrl: z.string().url('Image must be a valid URL').nullish(),
  lowStockThreshold: wholeNumber('Low stock threshold', 100_000).default(10),
  /** Opening stock. Recorded as a `purchase` movement, not a silent write. */
  initialQuantity: wholeNumber('Initial quantity', 1_000_000).default(0),
});

/**
 * Selling below cost is usually a typo, so it is rejected — but a deliberate
 * loss-leader is a real thing, hence the explicit `allowBelowCost` escape hatch.
 */
export const createProductSchema = {
  body: productBody
    .extend({ allowBelowCost: z.boolean().default(false) })
    .refine(
      (value) => value.allowBelowCost || value.sellingPrice >= value.purchasePrice,
      {
        message: 'Selling price is below purchase price — set allowBelowCost to confirm',
        path: ['sellingPrice'],
      },
    ),
};

export const updateProductSchema = {
  params: idParam,
  body: productBody
    .omit({ initialQuantity: true })
    .partial()
    .extend({ isActive: z.boolean().optional() })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'Provide at least one field to update',
    }),
};

export const productIdSchema = { params: idParam };

export const barcodeParamSchema = {
  params: z.object({ barcode }),
};

export const listProductsSchema = {
  query: paginationQuery.extend({
    search: z.string().trim().max(120).optional(),
    categoryId: uuid.optional(),
    stockStatus: z.enum(['in_stock', 'low_stock', 'out_of_stock']).optional(),
    isActive: booleanQuery.optional(),
    sortBy: z.enum(['name', 'created_at', 'selling_price', 'quantity']).default('created_at'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
};

export const deleteProductSchema = {
  params: idParam,
  query: z.object({
    /** Hard delete is admin-only and refused once a product appears on an order. */
    permanent: booleanQuery.optional(),
  }),
};

export type CreateProductInput = z.infer<typeof createProductSchema.body>;
export type UpdateProductInput = z.infer<typeof updateProductSchema.body>;
export type ListProductsQuery = z.infer<typeof listProductsSchema.query>;
