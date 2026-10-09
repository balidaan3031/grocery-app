import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { colors, radius, spacing, stockTone, type StockTone } from '../../theme';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

interface BadgeProps {
  label: string;
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Small filled circle instead of an icon — reads as a status light. */
  dot?: boolean;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

const TONES: Record<Tone, { bg: string; fg: string; dot: string }> = {
  neutral: { bg: colors.surfaceAlt, fg: colors.textSecondary, dot: colors.textMuted },
  primary: { bg: colors.primarySoft, fg: colors.onPrimarySoft, dot: colors.primary },
  success: { bg: colors.successSoft, fg: colors.onSuccessSoft, dot: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.onWarningSoft, dot: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.onDangerSoft, dot: colors.danger },
  info: { bg: colors.infoSoft, fg: colors.onInfoSoft, dot: colors.info },
  accent: { bg: colors.accentSoft, fg: colors.onAccentSoft, dot: colors.accent },
};

export const Badge = ({ label, tone = 'neutral', icon, dot, size = 'md', style }: BadgeProps) => {
  const palette = TONES[tone];

  return (
    <View
      style={[
        styles.badge,
        size === 'sm' ? styles.sm : styles.md,
        { backgroundColor: palette.bg },
        style,
      ]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: palette.dot }]} /> : null}
      {icon && !dot ? (
        <Ionicons name={icon} size={size === 'sm' ? 11 : 13} color={palette.fg} style={styles.icon} />
      ) : null}
      <Text variant={size === 'sm' ? 'caption' : 'smallMedium'} style={{ color: palette.fg }}>
        {label}
      </Text>
    </View>
  );
};

/**
 * Stock state as a badge. Wrapping it here means the label and colour for
 * "low stock" are decided in exactly one place across the whole app.
 */
export const StockBadge = ({
  status,
  quantity,
  unit,
  size = 'md',
  style,
}: {
  status: StockTone;
  quantity?: number;
  unit?: string;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}) => {
  const tone = stockTone[status];
  const label =
    quantity === undefined
      ? tone.label
      : status === 'out_of_stock'
        ? tone.label
        : `${quantity}${unit ? ` ${unit}` : ''}`;

  return (
    <View
      style={[styles.badge, size === 'sm' ? styles.sm : styles.md, { backgroundColor: tone.bg }, style]}
    >
      <View style={[styles.dot, { backgroundColor: tone.dot }]} />
      <Text variant={size === 'sm' ? 'caption' : 'smallMedium'} style={{ color: tone.fg }}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
  },
  sm: { paddingHorizontal: spacing.sm, paddingVertical: 3 },
  md: { paddingHorizontal: spacing.md, paddingVertical: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: spacing.xs },
  icon: { marginRight: spacing.xs },
});
