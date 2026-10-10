import { z } from 'zod';
import { cleanBarcode, hasValidCheckDigit } from '../utils/barcode';

export const uuid = z.string().uuid('Must be a valid id');

export const idParam = z.object({ id: uuid });

/** Trimmed, non-empty string with a sane upper bound. */
export const text = (max = 255, label = 'Value') =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be ${max} characters or fewer`);

export const optionalText = (max = 1000) =>
  z.string().trim().max(max).nullish().transform((value) => (value === '' ? null : value ?? null));

/** Money: never negative, at most two decimals. */
export const money = (label = 'Amount') =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .nonnegative(`${label} cannot be negative`)
    .max(99_999_999, `${label} is unrealistically large`)
    // Compared against the rounded value, with a tolerance for binary
    // fractions (19.99 * 100 is 1998.9999999999998). Testing
    // `Number.isInteger(Math.round(x))` would always pass and let 10.005
    // through for Postgres to round silently.
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
      message: `${label} may have at most 2 decimal places`,
    });

export const wholeNumber = (label = 'Value', max = 1_000_000) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(0, `${label} cannot be negative`)
    .max(max);

/**
 * Barcodes arrive from a camera or a keyboard-wedge scanner, which can wrap the
 * code in control characters (GS separators, CR/LF); those are stripped before
 * the shape is checked. The length window covers EAN-8 through GS1-128 and most
 * in-store labels. Must match products_barcode_format_chk in migration 0009.
 */
export const barcode = z
  .string()
  .transform(cleanBarcode)
  .pipe(
    z
      .string()
      .min(4, 'Barcode is too short')
      .max(64, 'Barcode is too long')
      .regex(/^[A-Za-z0-9\-._]+$/, 'Barcode may only contain letters, numbers, dash, dot or underscore'),
  );

/**
 * A barcode being saved to the catalogue. On top of the shape, an EAN/UPC must
 * carry a correct check digit: scanners verify it, so a mistyped one would be a
 * product no scan can ever reach. Lookups use the plain `barcode`, where a typo
 * is simply not found.
 */
export const catalogueBarcode = barcode.refine(hasValidCheckDigit, {
  message: 'The check digit does not match — re-check the number printed under the barcode',
});

/** Client-generated key that makes a retried write apply once. */
export const idempotencyKey = z.string().uuid('Idempotency key must be a UUID');

export const paginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100, 'Maximum page size is 100').default(20),
});

export const sortOrder = z.enum(['asc', 'desc']).default('desc');

/** Accepts `true`/`false`/`1`/`0` from a query string. */
export const booleanQuery = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');
