import type { PostgrestError } from '@supabase/supabase-js';
import type { Paginated, PaginationMeta } from '../types';

export interface PageParams {
  page: number;
  limit: number;
}

/** Converts 1-based page params into the inclusive `[from, to]` range PostgREST wants. */
export const toRange = ({ page, limit }: PageParams): { from: number; to: number } => {
  const from = (page - 1) * limit;
  return { from, to: from + limit - 1 };
};

export const buildMeta = ({ page, limit }: PageParams, total: number): PaginationMeta => {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
};

/**
 * PostgREST answers a page past the end with an error (PGRST103) rather than an
 * empty list. That happens when rows disappear between two page fetches — a
 * product deactivated while someone scrolls — so it is answered as the empty
 * last page it is, not as a 500. The error's detail carries the real total.
 */
export const pastLastPage = <T>(error: PostgrestError, params: PageParams): Paginated<T> | null => {
  if (error.code !== 'PGRST103') return null;
  const reported = /only (\d+) rows?/i.exec(`${error.details ?? ''} ${error.message}`)?.[1];
  const total = reported !== undefined ? Number(reported) : (params.page - 1) * params.limit;
  return { items: [], meta: buildMeta(params, total) };
};
