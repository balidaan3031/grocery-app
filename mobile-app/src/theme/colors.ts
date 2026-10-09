/**
 * Colour system.
 *
 * The palette is deliberately narrow: one fresh green ramp carries brand and
 * action, a teal accent supports it, and everything structural is a cool
 * neutral. Status colours appear only on status. Keeping strong colour rare is
 * what makes a scanned-and-added confirmation actually read as a signal.
 *
 * Nothing outside this file should hard-code a hex value — screens consume the
 * semantic names below so a palette change stays a one-file change.
 */

const palette = {
  // Fresh green — brand, primary actions, positive states
  green50: '#EFFBF5',
  green100: '#D6F5E5',
  green200: '#AAEACA',
  green300: '#74D9AB',
  green400: '#3FC48C',
  green500: '#17A673',
  green600: '#0F8A5F',
  green700: '#0C6D4B',
  green800: '#0A5239',

  // Teal — secondary accent, informational highlights
  teal50: '#EEFAFA',
  teal100: '#CFF1F0',
  teal200: '#9FE3E1',
  teal400: '#3FC8C4',
  teal500: '#16A9A5',
  teal600: '#0E8683',

  // Soft mint — large tinted surfaces
  mint50: '#F4FCF8',
  mint100: '#E4F7EE',

  // Cool neutrals — text, borders, chrome
  neutral0: '#FFFFFF',
  neutral50: '#F8FAFB',
  neutral100: '#F1F4F6',
  neutral200: '#E4E9ED',
  neutral300: '#CFD7DE',
  neutral400: '#9AA7B2',
  neutral500: '#6B7A88',
  neutral600: '#4D5A66',
  neutral700: '#374651',
  neutral800: '#22303A',
  neutral900: '#131E26',

  amber100: '#FEF0D3',
  amber500: '#E9930B',
  amber700: '#A56408',

  red50: '#FEF2F2',
  red100: '#FDE0E0',
  red500: '#E14B4B',
  red600: '#C93A3A',
  red700: '#9F2C2C',

  sky100: '#DCEEFB',
  sky500: '#2B8FE0',
  sky700: '#1B6BAC',
} as const;

export const colors = {
  palette,

  // Surfaces
  background: palette.neutral50,
  backgroundTinted: palette.mint50,
  surface: palette.neutral0,
  surfaceAlt: palette.neutral100,
  surfaceSunken: palette.neutral50,
  overlay: 'rgba(19, 30, 38, 0.55)',
  scrim: 'rgba(19, 30, 38, 0.82)',

  // Lines
  border: palette.neutral200,
  borderStrong: palette.neutral300,
  divider: palette.neutral100,

  // Text
  text: palette.neutral900,
  textSecondary: palette.neutral600,
  textMuted: palette.neutral400,
  textInverse: palette.neutral0,
  textOnPrimary: palette.neutral0,

  // Brand / actions
  primary: palette.green500,
  primaryPressed: palette.green600,
  primaryDark: palette.green700,
  primarySoft: palette.green50,
  primarySoftBorder: palette.green100,
  onPrimarySoft: palette.green700,

  accent: palette.teal500,
  accentSoft: palette.teal50,
  onAccentSoft: palette.teal600,

  // Status
  success: palette.green500,
  successSoft: palette.green50,
  onSuccessSoft: palette.green700,

  warning: palette.amber500,
  warningSoft: palette.amber100,
  onWarningSoft: palette.amber700,

  danger: palette.red500,
  dangerPressed: palette.red600,
  dangerSoft: palette.red50,
  onDangerSoft: palette.red700,

  info: palette.sky500,
  infoSoft: palette.sky100,
  onInfoSoft: palette.sky700,

  // Scanner chrome, which sits over a live camera feed
  scannerFrame: '#5FE3B0',
  scannerBackdrop: 'rgba(8, 20, 16, 0.62)',
} as const;

export type StockTone = 'in_stock' | 'low_stock' | 'out_of_stock';

/** Single mapping from stock state to colour, used by every badge and dot. */
export const stockTone: Record<StockTone, { bg: string; fg: string; dot: string; label: string }> = {
  in_stock: {
    bg: colors.successSoft,
    fg: colors.onSuccessSoft,
    dot: colors.success,
    label: 'In stock',
  },
  low_stock: {
    bg: colors.warningSoft,
    fg: colors.onWarningSoft,
    dot: colors.warning,
    label: 'Low stock',
  },
  out_of_stock: {
    bg: colors.dangerSoft,
    fg: colors.onDangerSoft,
    dot: colors.danger,
    label: 'Out of stock',
  },
};
