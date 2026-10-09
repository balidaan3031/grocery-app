import type { NextFunction, Request, Response } from 'express';
import { supabaseAdmin, supabaseAuth } from '../config/supabase';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { userRateLimiter } from './rateLimit';
import type { AuthenticatedUser } from '../types';

const BEARER = /^Bearer\s+(.+)$/i;

const extractToken = (req: Request): string | null => {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = BEARER.exec(header);
  return match?.[1]?.trim() || null;
};

/**
 * Verifies the caller's Supabase JWT and loads their store profile.
 *
 * Two checks, deliberately separate:
 *  1. Is the token valid? — answered by Supabase Auth, which owns signing keys.
 *  2. Is this still a usable staff account? — answered by public.users, so
 *     deactivating someone takes effect on their very next request rather than
 *     whenever their token happens to expire.
 */
export const authenticate = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) {
    throw ApiError.unauthorized('Missing bearer token');
  }

  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data.user) {
    throw ApiError.unauthorized('Session is invalid or has expired');
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (profileError || !profile) {
    throw ApiError.unauthorized('No store profile is linked to this account');
  }

  if (!profile.is_active) {
    throw ApiError.forbidden('This account has been deactivated');
  }

  const user: AuthenticatedUser = {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
    phone: profile.phone,
    avatarUrl: profile.avatar_url,
    isActive: profile.is_active,
  };

  req.user = user;
  req.accessToken = token;

  // The per-user budget can only be applied here, once the caller is known.
  return userRateLimiter(req, res, next);
});
