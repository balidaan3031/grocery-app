import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { PressableScale } from './PressableScale';
import { colors, radius, shadows, spacing, typography } from '../../theme';

type Tone = 'primary' | 'accent' | 'warning' | 'danger' | 'neutral';

interface StatTileProps {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: Tone;
  caption?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

const TONES: Record<Tone, { iconBg: string; iconFg: string }> = {
  primary: { iconBg: colors.primarySoft, iconFg: colors.primary },
  accent: { iconBg: colors.accentSoft, iconFg: colors.accent },
  warning: { iconBg: colors.warningSoft, iconFg: colors.warning },
  danger: { iconBg: colors.dangerSoft, iconFg: colors.danger },
  neutral: { iconBg: colors.surfaceAlt, iconFg: colors.textSecondary },
};

/**
 * Dashboard metric tile.
 *
 * The value is the loudest thing in the tile and uses tabular figures, so a
 * grid of tiles keeps its numbers optically aligned and a refreshing total does
 * not shuffle its own digits.
 */
export const StatTile = ({
  label,
  value,
  icon,
  tone = 'primary',
  caption,
  onPress,
  style,
}: StatTileProps) => {
  const palette = TONES[tone];

  const content = (
    <>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: palette.iconBg }]}>
          <Ionicons name={icon} size={17} color={palette.iconFg} />
        </View>
        {onPress ? <Ionicons name="chevron-forward" size={15} color={colors.textMuted} /> : null}
      </View>

      <Text style={[typography.numeric, styles.value]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>

      <Text variant="small" tone="secondary" numberOfLines={1}>
        {label}
      </Text>

      {caption ? (
        <Text variant="caption" tone="muted" numberOfLines={1} style={styles.caption}>
          {caption}
        </Text>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <PressableScale accessibilityRole="button" onPress={onPress} style={[styles.tile, style]}>
        {content}
      </PressableScale>
    );
  }

  return <View style={[styles.tile, style]}>{content}</View>;
};

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { fontSize: 22, lineHeight: 27, color: colors.text, marginBottom: 2 },
  caption: { marginTop: 3 },
});
