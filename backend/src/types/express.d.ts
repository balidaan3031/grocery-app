import type { AuthenticatedUser } from './index';

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware; present on every protected route. */
      user?: AuthenticatedUser;
      /** The raw bearer token, for calls that must run under the caller's RLS context. */
      accessToken?: string;
      id?: string;
    }
  }
}

export {};
