import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import type { ApiFailure } from '../types';

const failure: ApiFailure = {
  success: false,
  error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' },
};

/**
 * Broad protection for the whole API surface, per client IP.
 *
 * This runs before authentication, so it cannot see who is calling — keying it
 * by user here would silently fall back to the IP for every request. It is a
 * generous ceiling instead, because all the tills in a store normally share one
 * IP; the per-user budget is `userRateLimiter`, applied once a caller is known.
 */
export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_IP_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: failure,
  keyGenerator: (req) => req.ip ?? 'unknown',
});

/**
 * Per signed-in user, so one runaway client cannot exhaust the budget the rest
 * of the store's tills share. Called by `authenticate` once `req.user` is set.
 */
export const userRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: failure,
  keyGenerator: (req) => `user:${req.user?.id ?? req.ip ?? 'unknown'}`,
});

/** Much tighter budget on the login endpoint to blunt credential stuffing. */
export const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts, try again shortly' },
  } satisfies ApiFailure,
});
