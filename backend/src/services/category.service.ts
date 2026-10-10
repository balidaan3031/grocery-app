import { supabaseAdmin } from '../config/supabase';
import { ApiError } from '../utils/ApiError';
import { toApiError, unwrap } from '../utils/supabaseError';
import type { CategoryRow } from '../types';
import type { CreateCategoryInput, UpdateCategoryInput } from '../validators/category.validator';

export interface CategoryWithCount extends CategoryRow {
  productCount: number;
}

/** PostgREST's default `max-rows`; a larger page would be truncated to it. */
const COUNT_PAGE_SIZE = 1000;

export const listCategories = async (
  options: { includeInactive?: boolean; withCounts?: boolean } = {},
): Promise<CategoryRow[] | CategoryWithCount[]> => {
  let builder = supabaseAdmin.from('categories').select('*').order('name', { ascending: true });
  if (!options.includeInactive) builder = builder.eq('is_active', true);

  const categories = unwrap(await builder, 'Categories');

  if (!options.withCounts) return categories;

  // One grouped read instead of a count query per category — paged, because
  // PostgREST caps a response at 1000 rows and a single read silently
  // undercounted any catalogue larger than that.
  const counts = new Map<string, number>();
  for (let from = 0; ; from += COUNT_PAGE_SIZE) {
    const { data: products, error } = await supabaseAdmin
      .from('products')
      .select('category_id')
      .eq('is_active', true)
      .not('category_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + COUNT_PAGE_SIZE - 1);

    if (error) throw toApiError(error, 'Products');

    for (const row of products ?? []) {
      if (!row.category_id) continue;
      counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1);
    }

    if (!products || products.length < COUNT_PAGE_SIZE) break;
  }

  return categories.map((category) => ({
    ...category,
    productCount: counts.get(category.id) ?? 0,
  }));
};

export const getCategoryById = async (id: string): Promise<CategoryRow> =>
  unwrap(await supabaseAdmin.from('categories').select('*').eq('id', id).single(), 'Category');

export const createCategory = async (input: CreateCategoryInput): Promise<CategoryRow> =>
  unwrap(
    await supabaseAdmin
      .from('categories')
      .insert({
        name: input.name,
        description: input.description ?? null,
        color: input.color,
        icon: input.icon,
        is_active: true,
      })
      .select('*')
      .single(),
    'Category',
  );

export const updateCategory = async (
  id: string,
  input: UpdateCategoryInput,
): Promise<CategoryRow> => {
  const patch: Partial<Omit<CategoryRow, 'id' | 'created_at'>> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description ?? null;
  if (input.color !== undefined) patch.color = input.color;
  if (input.icon !== undefined) patch.icon = input.icon;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  if (Object.keys(patch).length === 0) {
    throw ApiError.badRequest('Provide at least one field to update');
  }

  return unwrap(
    await supabaseAdmin.from('categories').update(patch).eq('id', id).select('*').single(),
    'Category',
  );
};

/**
 * Deleting a category leaves its products intact (the FK is ON DELETE SET NULL),
 * but silently un-categorising a shelf full of stock is rarely what someone
 * means, so it is refused while products still point at it.
 */
export const deleteCategory = async (id: string): Promise<void> => {
  const { count, error } = await supabaseAdmin
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id)
    .eq('is_active', true);

  if (error) throw toApiError(error, 'Products');

  if ((count ?? 0) > 0) {
    throw ApiError.conflict(
      `${count} product${count === 1 ? '' : 's'} still use this category. Move them first, or deactivate the category.`,
    );
  }

  const { error: deleteError } = await supabaseAdmin.from('categories').delete().eq('id', id);
  if (deleteError) throw toApiError(deleteError, 'Category');
};
