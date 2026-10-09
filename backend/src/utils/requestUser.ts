import type { Request } from 'express';
import { ApiError } from './ApiError';
import type { AuthenticatedUser } from '../types';

/**
 * Narrows `req.user` from optional to definite.
 *
 * The type is optional because unauthenticated routes exist; reaching a
 * protected controller without a principal means the `authenticate` middleware
 * was left off the route, so this fails loudly instead of returning undefined.
 */
export const requireUser = (req: Request): AuthenticatedUser => {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
};
