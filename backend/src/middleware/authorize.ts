import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ApiError } from '../utils/ApiError';
import type { UserRole } from '../types';

/**
 * Role gate. Must run after `authenticate` — an absent principal here means the
 * route was wired up wrong, so it fails closed with a 401 rather than allowing.
 */
export const authorize =
  (...roles: UserRole[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `This action requires the ${roles.join(' or ')} role`,
        ),
      );
    }
    return next();
  };

/** Shorthand for the common case: catalogue and settings changes are admin-only. */
export const requireAdmin = authorize('admin');
