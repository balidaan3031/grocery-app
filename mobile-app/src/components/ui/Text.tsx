import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { colors, typography } from '../../theme';

type Variant = keyof typeof typography;
type Tone = 'default' | 'secondary' | 'muted' | 'inverse' | 'primary' | 'success' | 'warning' | 'danger';

interface AppTextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
  /** Convenience for centring a single line without a wrapper style. */
  center?: boolean;
}

const TONES: Record<Tone, string> = {
  default: colors.text,
  secondary: colors.textSecondary,
  muted: colors.textMuted,
  inverse: colors.textInverse,
  primary: colors.primary,
  success: colors.onSuccessSoft,
  warning: colors.onWarningSoft,
  danger: colors.danger,
};

/**
 * Typed text.
 *
 * Screens choose a role (`h2`, `caption`) and a tone, never a font size and a
 * hex value — which is what keeps hierarchy consistent across fourteen screens
 * written at different times.
 */
export const Text = ({ variant = 'body', tone = 'default', center, style, ...rest }: AppTextProps) => (
  <RNText
    style={[
      typography[variant] as TextStyle,
      { color: TONES[tone] },
      center && { textAlign: 'center' },
      style,
    ]}
    {...rest}
  />
);
