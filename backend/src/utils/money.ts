/**
 * Rounds to 2 decimal places using the same half-up rule as Postgres `round()`.
 *
 * Cart previews are computed in Node while the authoritative order totals are
 * computed in SQL; if the two rounded differently, the number on the checkout
 * screen would not match the number on the receipt.
 */
export const round2 = (value: number): number => {
  const scaled = value * 100;
  // Nudge past binary float error (2.675 * 100 === 267.49999...) before rounding.
  const corrected = Math.round((scaled + Number.EPSILON * Math.sign(scaled) * Math.abs(scaled)) * 1e6) / 1e6;
  return Math.round(corrected) / 100;
};

export const lineAmounts = (
  unitPrice: number,
  quantity: number,
  taxRate: number,
): { subtotal: number; tax: number; total: number } => {
  const subtotal = round2(unitPrice * quantity);
  const tax = round2((subtotal * taxRate) / 100);
  return { subtotal, tax, total: round2(subtotal + tax) };
};
