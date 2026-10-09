import { useEffect, useState } from 'react';

/**
 * Delays a rapidly-changing value.
 *
 * Search boxes use this so typing "milk" issues one request rather than four,
 * which matters more than usual here: product search hits a trigram index over
 * the whole catalogue.
 */
export const useDebounce = <T>(value: T, delay = 350): T => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
};
