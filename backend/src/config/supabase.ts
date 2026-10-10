import { createClient, type SupabaseClientOptions } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { env } from './env';
import type { Database } from '../types/database';

const clientOptions: SupabaseClientOptions<'public'> = {
  auth: {
    // The API is stateless: every request carries its own bearer token, so the
    // client must not persist or silently refresh a session of its own.
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  realtime: {
    // supabase-js constructs a realtime client eagerly and throws on Node < 22,
    // which has no global WebSocket. This API never subscribes to realtime, but
    // the constructor still has to be handed something usable. The cast bridges
    // the `ws` implementation to the DOM WebSocket type the option expects.
    transport: WebSocket as unknown as SupabaseClientOptions<'public'>['realtime'] extends {
      transport?: infer T;
    }
      ? T
      : never,
  },
};

const createTypedClient = (key: string, options: SupabaseClientOptions<'public'> = clientOptions) =>
  createClient<Database>(env.SUPABASE_URL, key, options);

/** The concrete, fully-typed client type shared by the service layer. */
export type AppSupabaseClient = ReturnType<typeof createTypedClient>;

/**
 * Service-role client. Bypasses Row Level Security, so it is the workhorse for
 * all trusted server-side reads and writes — authorisation is enforced by the
 * route middleware before anything reaches here.
 */
export const supabaseAdmin: AppSupabaseClient = createTypedClient(env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Anon-key client for verifying bearer tokens (`auth.getUser(token)`), which
 * reads nothing from the client's own state. It holds no elevated privileges.
 */
export const supabaseAuth: AppSupabaseClient = createTypedClient(env.SUPABASE_ANON_KEY);

/**
 * A fresh anon-key client for one sign-in or refresh.
 *
 * The auth client is stateful even with `persistSession: false`: it keeps the
 * last session in memory and shares one in-flight refresh between all callers,
 * whatever token each passed. One client shared across requests therefore
 * handed a till that refreshed alongside another till that other user's
 * session, and spent the last signed-in user's refresh token on someone else's
 * refresh. A client per exchange has nobody else's state to leak.
 */
export const createAuthClient = (): AppSupabaseClient => createTypedClient(env.SUPABASE_ANON_KEY);
