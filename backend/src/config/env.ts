import 'dotenv/config';
import { z } from 'zod';

/**
 * Every environment variable the API depends on, validated once at boot.
 *
 * Failing here — loudly, before the server binds a port — is far cheaper than
 * discovering a missing Supabase key on the first checkout request.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().startsWith('/').default('/api/v1'),

  SUPABASE_URL: z.string().url({ message: 'SUPABASE_URL must be your project URL' }),
  /** Public (anon / publishable) key — used for password sign-in on behalf of a user. */
  SUPABASE_ANON_KEY: z.string().min(20, 'SUPABASE_ANON_KEY is required'),
  /**
   * Service-role key. Bypasses RLS, so it must never leave the server or be
   * bundled into the mobile app.
   */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  SUPABASE_STORAGE_BUCKET: z.string().default('product-images'),

  /**
   * Direct Postgres connection, used only by the migration script — the API
   * itself talks to Supabase over HTTPS. Optional so the server boots without it.
   */
  DATABASE_URL: z.string().url().optional(),

  /** Comma-separated list, or `*` to allow any origin (development only). */
  CORS_ORIGINS: z.string().default('*'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  /** Per signed-in user, per window. */
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  /** Per client IP, per window. Every till in a store usually shares one IP, so keep this well above RATE_LIMIT_MAX. */
  RATE_LIMIT_IP_MAX: z.coerce.number().int().positive().default(3000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

  /** Presentation defaults surfaced to the client via /api/v1/config. */
  CURRENCY_CODE: z.string().length(3).default('INR'),
  CURRENCY_SYMBOL: z.string().min(1).default('₹'),
  STORE_NAME: z.string().default('Fresh Mart'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  · ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // Deliberately console.error: the logger itself reads from this config.
  console.error(`\nInvalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV === 'development',
  corsOrigins: raw.CORS_ORIGINS === '*'
    ? ('*' as const)
    : raw.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
} as const;

export type Env = typeof env;
