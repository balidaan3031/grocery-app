import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import { colors } from './colors';

export { colors, stockTone } from './colors';
export type { StockTone } from './colors';

/**
 * 4pt spacing scale. Everything in the app positions on this grid; ad-hoc
 * margins are what make an interface feel subtly wrong even when nothing is
 * obviously misaligned.
 */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 56,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
  pill: 999,
} as const;

/**
 * Platform-native type. iOS gets San Francisco and Android gets Roboto, both by
 * way of the system default — a bundled webfont would cost a load flash on
 * every cold start for no gain in a utility app.
 */
const fontFamily = Platform.select({
  ios: { regular: 'System', medium: 'System', semibold: 'System', bold: 'System' },
  default: {
    regular: 'sans-serif',
    medium: 'sans-serif-medium',
    semibold: 'sans-serif-medium',
    bold: 'sans-serif',
  },
})!;

const weight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** Named text styles. Screens pick a role, not a font size. */
export const typography = {
  display: {
    fontFamily: fontFamily.bold,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: weight.bold,
    letterSpacing: -0.6,
  },
  h1: {
    fontFamily: fontFamily.bold,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: weight.bold,
    letterSpacing: -0.4,
  },
  h2: {
    fontFamily: fontFamily.semibold,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: weight.semibold,
    letterSpacing: -0.2,
  },
  h3: {
    fontFamily: fontFamily.semibold,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: weight.semibold,
    letterSpacing: -0.1,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: weight.regular,
  },
  bodyMedium: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: weight.medium,
  },
  small: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: weight.regular,
  },
  smallMedium: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: weight.medium,
  },
  caption: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: weight.medium,
    letterSpacing: 0.3,
  },
  overline: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: weight.semibold,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  /** Prices and quantities: tabular figures stop totals jittering as they change. */
  numeric: {
    fontFamily: Platform.select({ ios: 'System', default: 'sans-serif-medium' }),
    fontVariant: ['tabular-nums'],
    fontWeight: weight.semibold,
  },
} satisfies Record<string, TextStyle>;

/**
 * Elevation presets. iOS shadows and Android elevation are tuned to look like
 * the same object rather than to share the same numbers.
 */
const makeShadow = (
  y: number,
  blur: number,
  opacity: number,
  elevation: number,
): ViewStyle =>
  Platform.select<ViewStyle>({
    ios: {
      shadowColor: colors.palette.neutral900,
      shadowOffset: { width: 0, height: y },
      shadowOpacity: opacity,
      shadowRadius: blur,
    },
    default: { elevation },
  })!;

export const shadows = {
  none: {} as ViewStyle,
  xs: makeShadow(1, 2, 0.05, 1),
  sm: makeShadow(2, 6, 0.06, 2),
  md: makeShadow(6, 14, 0.08, 5),
  lg: makeShadow(12, 24, 0.11, 10),
  primary: Platform.select<ViewStyle>({
    ios: {
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.28,
      shadowRadius: 16,
    },
    default: { elevation: 8 },
  })!,
} as const;

/**
 * Extra tappable area around small controls. The app is used one-handed at a
 * counter, so a 20pt icon needs a target closer to 40pt.
 */
export const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 } as const;
