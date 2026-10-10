import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { messageOf } from '../utils/errors';

interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
}

export interface UseAsyncResult<T> extends AsyncState<T> {
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  setData: (updater: T | ((current: T | null) => T | null)) => void;
}

/**
 * Fetch-on-mount with pull-to-refresh, the shape nearly every screen needs.
 *
 * `refresh()` keeps the current data on screen and only sets `isRefreshing`,
 * so a pull-to-refresh does not blank out the list the user is looking at.
 *
 * Deliberately small: the app has no cache-invalidation story to speak of, and
 * a data-fetching library would be more machinery than the problem warrants.
 */
export const useAsync = <T>(
  fetcher: () => Promise<T>,
  options: { immediate?: boolean; refetchOnFocus?: boolean } = {},
): UseAsyncResult<T> => {
  const { immediate = true, refetchOnFocus = false } = options;

  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    isLoading: immediate,
    isRefreshing: false,
    error: null,
  });

  // Keeping the fetcher in a ref lets callers pass an inline arrow without
  // re-triggering the effect on every render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  /**
   * Each run claims a token and only the newest may write state. A screen that
   * loads on mount and refetches on focus starts two requests at once; without
   * this, whichever landed last won, and the refresh starting cleared the
   * loading flag so the screen rendered empty in between.
   */
  const runToken = useRef(0);

  const run = useCallback(async (mode: 'load' | 'refresh') => {
    const token = (runToken.current += 1);

    setState((current) => {
      // Nothing on screen yet means a refresh is really a first load: show the
      // loading state, not an empty screen under a pull-to-refresh spinner.
      const isLoading = mode === 'load' || current.data === null;
      return { ...current, isLoading, isRefreshing: !isLoading, error: null };
    });

    try {
      const data = await fetcherRef.current();
      if (!isMounted.current || token !== runToken.current) return;
      setState({ data, isLoading: false, isRefreshing: false, error: null });
    } catch (error) {
      if (!isMounted.current || token !== runToken.current) return;
      setState((current) => ({
        ...current,
        isLoading: false,
        isRefreshing: false,
        error: messageOf(error),
      }));
    }
  }, []);

  const reload = useCallback(() => run('load'), [run]);
  const refresh = useCallback(() => run('refresh'), [run]);

  useEffect(() => {
    if (immediate) void run('load');
  }, [immediate, run]);

  // Data that another screen can change (stock, orders) should be current when
  // the user navigates back to it. The first focus is the mount, which the
  // load above already covers.
  const skipFocus = useRef(immediate);
  useFocusEffect(
    useCallback(() => {
      if (skipFocus.current) {
        skipFocus.current = false;
        return;
      }
      if (refetchOnFocus) void run('refresh');
    }, [refetchOnFocus, run]),
  );

  const setData = useCallback((updater: T | ((current: T | null) => T | null)) => {
    setState((current) => ({
      ...current,
      data:
        typeof updater === 'function'
          ? (updater as (value: T | null) => T | null)(current.data)
          : updater,
    }));
  }, []);

  return { ...state, reload, refresh, setData };
};
