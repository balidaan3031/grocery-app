import type { PostgrestError } from '@supabase/supabase-js';
import { ApiError } from './ApiError';
import { logger } from '../config/logger';

/**
 * Friendly messages for the unique indexes a user can realistically collide
 * with. Keyed by index name so the message stays correct if the column is
 * renamed but the constraint is not.
 */
const UNIQUE_CONSTRAINTS: Record<string, string> = {
  // The key index catches the same GTIN written in another format (0009).
  products_barcode_key_unique_idx: 'A product with this barcode already exists',
  products_barcode_unique_idx: 'A product with this barcode already exists',
  products_sku_unique_idx: 'A product with this SKU already exists',
  categories_name_unique_idx: 'A category with this name already exists',
  cart_items_unique_product: 'That product is already in the cart',
  users_email_key: 'An account with this email already exists',
  orders_order_number_key: 'Duplicate order number, please retry',
  inventory_request_keys_pkey: 'This request key was already used for a different stock change',
};

/** Check constraints a caller can trip with a value the API validator missed. */
const CHECK_CONSTRAINTS: Record<string, string> = {
  products_barcode_format_chk:
    'Barcode must be 4–64 letters, numbers, dashes, dots or underscores, with no spaces',
};

const findConstraintMessage = (
  error: PostgrestError,
  messages: Record<string, string> = UNIQUE_CONSTRAINTS,
): string | undefined => {
  const haystack = `${error.message} ${error.details ?? ''}`;
  const match = Object.keys(messages).find((name) => haystack.includes(name));
  return match ? messages[match] : undefined;
};

/** The `detail` payload our plpgsql functions attach to stock failures. */
const parseDetails = (details: string | null): unknown => {
  if (!details) return undefined;
  try {
    return JSON.parse(details);
  } catch {
    return undefined;
  }
};

/**
 * Translates a PostgREST/Postgres failure into the right HTTP error.
 *
 * Without this, every constraint violation and every deliberate `raise
 * exception` in a database function would surface to the app as an opaque 500.
 */
export const toApiError = (error: PostgrestError, resource = 'Resource'): ApiError => {
  switch (error.code) {
    // Custom SQLSTATEs raised by the functions in migrations 0004 and 0009.
    case 'ZS001':
      return ApiError.insufficientStock(error.message, parseDetails(error.details));
    case 'ZS002':
      return ApiError.badRequest(error.message);
    case 'ZS003':
      return new ApiError(404, 'NOT_FOUND', error.message);
    case 'ZS004':
      return ApiError.badRequest(error.message);
    case 'ZS005':
      return new ApiError(409, 'IDEMPOTENCY_KEY_REUSED', error.message);
    case 'ZS006':
      return ApiError.badRequest(error.message);

    // PostgREST: `.single()` matched zero rows.
    case 'PGRST116':
      return ApiError.notFound(resource);

    case '23505':
      return ApiError.conflict(findConstraintMessage(error) ?? 'That record already exists');
    case '23503':
      return ApiError.badRequest('Referenced record does not exist', { hint: error.hint });
    case '23514':
      return ApiError.badRequest(
        findConstraintMessage(error, CHECK_CONSTRAINTS) ?? 'A value is outside its allowed range',
        { hint: error.hint },
      );
    case '22P02':
      return ApiError.badRequest('Malformed value in request');
    case '42501':
      return ApiError.forbidden('Not permitted by database policy');

    // The database is behind the code: a migration has not been applied, or
    // PostgREST's schema cache predates it. Said plainly, because "Database
    // request failed" sends whoever is debugging it looking in the wrong place.
    case 'PGRST202': // function not found
    case 'PGRST204': // column not found
    case 'PGRST205': // table or view not found
    case '42703': // undefined column
    case '42883': // undefined function
    case '42P01': // undefined table
      logger.error({ err: error }, 'Database schema is out of date');
      return new ApiError(
        500,
        'SCHEMA_OUT_OF_DATE',
        'The database is missing a recent migration. Apply the pending migrations in supabase/migrations, then reload the schema cache.',
      );

    default:
      logger.error({ err: error }, 'Unmapped Supabase error');
      return ApiError.internal('Database request failed');
  }
};

/**
 * Mirrors PostgrestSingleResponse: a discriminated union rather than
 * `{ data: T | null; error: E | null }`.
 *
 * The looser shape makes TypeScript infer `T` as `never` for `.single()` calls,
 * which silently turns every unwrapped row into an unusable type. Matching the
 * real union keeps inference exact.
 */
type SupabaseResult = { data: unknown; error: PostgrestError | null };

/**
 * Unwraps a Supabase result, throwing the mapped ApiError on failure.
 * Keeps services free of repetitive `if (error) throw ...` blocks.
 *
 * The generic is the *whole response* rather than the row type. Declaring the
 * parameter as `{ data: T | null }` instead makes it a contextual type for the
 * query builder's `then()`, and TypeScript then resolves the awaited value to
 * `never` for inline `unwrap(await query.single())` calls — the row type
 * silently disappears. Inferring `R` and projecting `R['data']` keeps the
 * builder's own return type intact.
 */
export const unwrap = <R extends SupabaseResult>(
  result: R,
  resource = 'Resource',
): NonNullable<R['data']> => {
  if (result.error) throw toApiError(result.error, resource);
  if (result.data === null || result.data === undefined) throw ApiError.notFound(resource);
  return result.data as NonNullable<R['data']>;
};

/** Same as `unwrap`, but a null result is a legitimate "not found" for the caller to handle. */
export const unwrapMaybe = <R extends SupabaseResult>(
  result: R,
  resource = 'Resource',
): R['data'] | null => {
  if (result.error) {
    if (result.error.code === 'PGRST116') return null;
    throw toApiError(result.error, resource);
  }
  return result.data;
};
