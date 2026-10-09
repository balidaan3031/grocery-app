/**
 * A v4 UUID for idempotency keys.
 *
 * Uses the platform's crypto when the JS engine provides it. The fallback is
 * not cryptographically strong, which is fine here: a key only has to be
 * unique among one user's in-flight requests, not unguessable.
 */
export const createId = (): string => {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
};
