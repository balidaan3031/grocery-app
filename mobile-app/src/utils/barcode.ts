/**
 * Barcode helpers for the scanner and the product form.
 *
 * The check-digit rules mirror backend/src/utils/barcode.ts, so the form can
 * flag a mistyped EAN/UPC before the API refuses it.
 */

/** Numeric codes of a GTIN length: EAN-8, UPC-A, EAN-13, GTIN-14. */
const GTIN = /^(\d{8}|\d{12,14})$/;

/** What the API accepts; see the backend `barcode` validator. */
export const BARCODE_PATTERN = /^[A-Za-z0-9\-._]{4,64}$/;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g;

/**
 * Drops what a camera or keyboard-wedge scanner wraps a code in — GS1
 * separators, line endings, edge whitespace — so the same packet always
 * produces the same string.
 */
export const cleanBarcode = (raw: string): string => raw.replace(CONTROL_CHARACTERS, '').trim();

/** GS1 mod-10: weights 3,1,3,… from the digit next to the check digit. */
const checkDigitMatches = (digits: string): boolean => {
  let sum = 0;
  for (let index = digits.length - 2, weight = 3; index >= 0; index -= 1, weight = 4 - weight) {
    sum += Number(digits[index]) * weight;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
};

/** UPC-E's check digit belongs to the UPC-A it expands to. */
const expandUpcE = (code: string): string | null => {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const [system, d1, d2, d3, d4, d5, d6, check] = code.split('');
  let body: string;
  if (d6 === '0' || d6 === '1' || d6 === '2') body = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  else if (d6 === '3') body = `${d1}${d2}${d3}00000${d4}${d5}`;
  else if (d6 === '4') body = `${d1}${d2}${d3}${d4}00000${d5}`;
  else body = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  return `${system}${body}${check}`;
};

/**
 * True unless the code is a numeric EAN/UPC whose last digit is wrong — which
 * means a typo, because a scanner never reports a code that fails its check.
 */
export const hasValidCheckDigit = (barcode: string): boolean => {
  const value = barcode.trim();
  if (!GTIN.test(value)) return true;
  if (checkDigitMatches(value)) return true;
  const upcA = value.length === 8 ? expandUpcE(value) : null;
  return upcA !== null && checkDigitMatches(upcA);
};

/**
 * Why a typed barcode cannot be used, or null if it can. Shared by the product
 * form and the scanner's manual entry so both say the same thing.
 */
export const barcodeProblem = (raw: string): string | null => {
  const value = cleanBarcode(raw);
  if (!value) return 'Enter a barcode';
  if (value.length < 4) return 'That barcode looks too short';
  if (value.length > 64) return 'That barcode is too long';
  if (!BARCODE_PATTERN.test(value)) return 'Use only letters, numbers, dash, dot or underscore';
  if (!hasValidCheckDigit(value)) return 'The last digit does not match — check the number again';
  return null;
};

/**
 * Symbologies whose decoders verify a check digit before reporting a read. The
 * others (Code 39 and Codabar in particular) can report a misread from one
 * blurry frame, so the scanner waits for a second identical read.
 *
 * Matched on letters and digits only: expo-camera types the field as a plain
 * string, and the native layers spell the same format `ean13`, `EAN-13` or
 * `org.gs1.EAN-13`.
 */
const SELF_CHECKING = ['ean13', 'ean8', 'upca', 'upce', 'code128', 'code93', 'itf14'];

export const needsSecondRead = (type: string | undefined): boolean => {
  const token = (type ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return !SELF_CHECKING.some((format) => token.endsWith(format));
};
