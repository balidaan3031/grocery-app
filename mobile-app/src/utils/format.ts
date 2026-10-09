/**
 * Presentation helpers.
 *
 * Currency is configured once, at app start, from GET /config — so a store
 * running in another market changes one env var rather than every screen.
 */

let currencySymbol = '₹';
let currencyCode = 'INR';

export const configureCurrency = (symbol: string, code: string): void => {
  currencySymbol = symbol;
  currencyCode = code;
};

export const getCurrencySymbol = (): string => currencySymbol;
export const getCurrencyCode = (): string => currencyCode;

/**
 * Money, always with two decimals and grouped thousands.
 * Intl is available in Hermes; the manual fallback covers the rare build
 * without full ICU rather than letting a price render as "NaN".
 */
export const formatCurrency = (value: number | string | null | undefined, withSymbol = true): string => {
  const amount = typeof value === 'string' ? Number(value) : (value ?? 0);
  const safe = Number.isFinite(amount) ? amount : 0;

  let formatted: string;
  try {
    formatted = new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    formatted = safe.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  return withSymbol ? `${currencySymbol}${formatted}` : formatted;
};

/** Compact money for tiles where space is tight (₹1.2L, ₹45.8k). */
export const formatCompactCurrency = (value: number): string => {
  const safe = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(safe);
  if (abs >= 10_000_000) return `${currencySymbol}${(safe / 10_000_000).toFixed(1)}Cr`;
  if (abs >= 100_000) return `${currencySymbol}${(safe / 100_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${currencySymbol}${(safe / 1_000).toFixed(1)}k`;
  return formatCurrency(safe);
};

export const formatNumber = (value: number | null | undefined): string => {
  const safe = Number.isFinite(value ?? NaN) ? (value as number) : 0;
  try {
    return new Intl.NumberFormat('en-IN').format(safe);
  } catch {
    return String(safe);
  }
};

/** Signed quantity, for the movement ledger: "+12" / "−2". */
export const formatDelta = (value: number): string =>
  value > 0 ? `+${value}` : `−${Math.abs(value)}`;

const pad = (n: number): string => String(n).padStart(2, '0');

export const formatTime = (iso: string): string => {
  const date = new Date(iso);
  let hours = date.getHours();
  const minutes = pad(date.getMinutes());
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${meridiem}`;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const formatDate = (iso: string): string => {
  const date = new Date(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

export const formatDateTime = (iso: string): string => `${formatDate(iso)} · ${formatTime(iso)}`;

const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * Human timestamps for lists. Recent activity is the common case, so it reads
 * relatively; anything older falls back to a real date.
 */
export const formatRelative = (iso: string): string => {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  if (isSameDay(date, now)) return formatTime(iso);

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return `Yesterday, ${formatTime(iso)}`;

  const diffDays = Math.round(diffMs / 86_400_000);
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatDate(iso);
};

/** "3 items" / "1 item" without a helper call at every site. */
export const pluralise = (count: number, singular: string, plural?: string): string =>
  `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;

export const initialsOf = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
};

/** Groups a barcode into readable blocks: 8901030100000 -> 890 1030 100000. */
export const formatBarcode = (barcode: string): string => {
  if (barcode.length !== 13) return barcode;
  return `${barcode.slice(0, 3)} ${barcode.slice(3, 7)} ${barcode.slice(7)}`;
};

export const MOVEMENT_LABELS: Record<string, string> = {
  purchase: 'Restock',
  sale: 'Sale',
  adjustment: 'Adjustment',
  return: 'Return',
  damage: 'Damaged',
};

export const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  other: 'Other',
};
