import type { PaginationMeta } from '../types';

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
