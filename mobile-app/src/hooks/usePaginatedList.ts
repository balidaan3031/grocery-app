import { useCallback, useEffect, useRef, useState } from 'react';
import { messageOf } from '../utils/errors';
import type { PaginationMeta } from '../types';

interface Page<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface UsePaginatedListResult<T> {
  items: T[];
  meta: PaginationMeta | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  error: string | null;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  loadMore: () => void;
  replaceItem: (id: string, next: T) => void;
  removeItem: (id: string) => void;
}

/**
 * Infinite list backed by the API's page/limit endpoints.
 *
 * Three loading flags rather than one, because a list needs to distinguish an
 * empty first load (skeleton), a pull-to-refresh (keep the rows) and a footer
 * fetch (spinner at the bottom) — collapsing them makes every list feel wrong
 * in at least one of those states.
 *
 * `fetchPage` is expected to be memoised by the caller; changing it resets to
 * page 1, which is what a filter or search change should do.
 */
export const usePaginatedList = <T extends { id: string }>(
  fetchPage: (page: number) => Promise<Page<T>>,
  options: { immediate?: boolean } = {},
): UsePaginatedListResult<T> => {
  const { immediate = true } = options;

  const [items, setItems] = useState<T[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(immediate);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  /**
   * Guards against a stale page landing after the user has changed the filter.
   * Each run claims a token; only the newest one is allowed to write state.
   */
  const runToken = useRef(0);
  const inFlight = useRef(false);

  const load = useCallback(async (page: number, mode: 'load' | 'refresh' | 'more') => {
    if (inFlight.current && mode === 'more') return;

    const token = (runToken.current += 1);
    inFlight.current = true;

    if (mode === 'load') setIsLoading(true);
    if (mode === 'refresh') setIsRefreshing(true);
    if (mode === 'more') setIsLoadingMore(true);
    setError(null);

    try {
      const result = await fetchRef.current(page);
      if (!isMounted.current || token !== runToken.current) return;

      setItems((current) => (mode === 'more' ? [...current, ...result.items] : result.items));
      setMeta(result.meta);
    } catch (caught) {
      if (!isMounted.current || token !== runToken.current) return;
      setError(messageOf(caught));
      if (mode !== 'more') setItems([]);
    } finally {
      if (isMounted.current && token === runToken.current) {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (immediate) void load(1, 'load');
  }, [immediate, load, fetchPage]);

  const reload = useCallback(() => load(1, 'load'), [load]);
  const refresh = useCallback(() => load(1, 'refresh'), [load]);

  const loadMore = useCallback(() => {
    if (!meta?.hasMore || isLoadingMore || isLoading || isRefreshing) return;
    void load(meta.page + 1, 'more');
  }, [meta, isLoadingMore, isLoading, isRefreshing, load]);

  /** Local edits, so a detail-screen change shows without refetching the page. */
  const replaceItem = useCallback((id: string, next: T) => {
    setItems((current) => current.map((item) => (item.id === id ? next : item)));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  return {
    items,
    meta,
    isLoading,
    isRefreshing,
    isLoadingMore,
    error,
    reload,
    refresh,
    loadMore,
    replaceItem,
    removeItem,
  };
};
