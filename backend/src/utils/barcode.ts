/**
 * Barcode handling shared by scanner lookups and catalogue writes.
 *
 * A phone camera does not report a code the way it is printed: iOS reads a
 * UPC-A as the 13-digit EAN with a leading zero, Android as 12 digits, and a
 * hardware scanner may wrap either in a line ending or a GS1 separator. These
 * helpers make all of those land on the same product.
 *
 * `barcodeKey` mirrors `public.barcode_key()` in migration 0009, which backs the
 * unique index on products — the two must always change together.
 */

/** Numeric codes of a GTIN length: EAN-8, UPC-A, EAN-13, GTIN-14. */
const GTIN = /^(\d{8}|\d{12,14})$/;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g;

/** Drops what scanners add around a code: control characters (GS, CR, LF) and edge whitespace. */
export const cleanBarcode = (raw: string): string => raw.replace(CONTROL_CHARACTERS, '').trim();

/** The matching key: GTINs padded to 14 digits, everything else as written. */
export const barcodeKey = (barcode: string): string => {
  const value = barcode.trim();
  return GTIN.test(value) ? value.padStart(14, '0') : value;
};

/**
 * Every way the same code can be written, for a lookup that has to hit
 * whichever form the catalogue stored. The unique index on the key guarantees
 * at most one product matches the whole set.
 */
export const barcodeVariants = (barcode: string): string[] => {
  const value = barcode.trim();
  if (!GTIN.test(value)) return [value];

  const key = value.padStart(14, '0');
  const variants = new Set<string>([value]);

  for (const length of [8, 12, 13, 14]) {
    // Only drop leading zeros: a shorter form exists only if they are all zero.
    if (/^0*$/.test(key.slice(0, 14 - length))) variants.add(key.slice(14 - length));
  }

  return [...variants];
};

/** GS1 mod-10: weights 3,1,3,… from the digit next to the check digit. */
const checkDigitMatches = (digits: string): boolean => {
  let sum = 0;
  for (let index = digits.length - 2, weight = 3; index >= 0; index -= 1, weight = 4 - weight) {
    sum += Number(digits[index]) * weight;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
};

/**
 * UPC-E is printed as 8 digits but its check digit belongs to the UPC-A it
 * expands to, so an 8-digit code that fails as EAN-8 may still be valid UPC-E.
 */
const expandUpcE = (code: string): string | null => {
  if (!/^[01]\d{7}$/.test(code)) return null;

  const [system, d1, d2, d3, d4, d5, d6, check] = code.split('') as [
    string, string, string, string, string, string, string, string,
  ];

  let body: string;
  if (d6 === '0' || d6 === '1' || d6 === '2') body = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  else if (d6 === '3') body = `${d1}${d2}${d3}00000${d4}${d5}`;
  else if (d6 === '4') body = `${d1}${d2}${d3}${d4}00000${d5}`;
  else body = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;

  return `${system}${body}${check}`;
};

/**
 * A numeric code of a GTIN length must carry a correct check digit. Camera
 * decoders verify it before reporting a read, so a catalogue entry with a wrong
 * one is a typo that no scan will ever match. Other shapes have no check digit
 * to test and pass.
 */
export const hasValidCheckDigit = (barcode: string): boolean => {
  const value = barcode.trim();
  if (!GTIN.test(value)) return true;
  if (checkDigitMatches(value)) return true;

  const upcA = value.length === 8 ? expandUpcE(value) : null;
  return upcA !== null && checkDigitMatches(upcA);
};
