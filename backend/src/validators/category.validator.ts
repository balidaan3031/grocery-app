import { z } from 'zod';
import { booleanQuery, idParam, optionalText, text } from './common.validator';

const hexColor = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Colour must be a hex value such as #10B981');

const categoryBody = z.object({
  name: text(80, 'Category name'),
  description: optionalText(500).optional(),
  color: hexColor.default('#10B981'),
  /** Ionicons glyph name, rendered by the mobile client. */
  icon: text(48, 'Icon').default('basket-outline'),
});

export const createCategorySchema = { body: categoryBody };

export const updateCategorySchema = {
  params: idParam,
  body: categoryBody
    .partial()
    .extend({ isActive: z.boolean().optional() })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'Provide at least one field to update',
    }),
};

export const categoryIdSchema = { params: idParam };

export const listCategoriesSchema = {
  query: z.object({
    includeInactive: booleanQuery.optional(),
    withCounts: booleanQuery.optional(),
  }),
};

export type CreateCategoryInput = z.infer<typeof createCategorySchema.body>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema.body>;
