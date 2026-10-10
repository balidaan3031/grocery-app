import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { PressableScale } from './PressableScale';
import { colors, hitSlop, radius, shadows, spacing } from '../../theme';
import { initialsOf } from '../../utils/format';

/** Hairline separator. */
export const Divider = ({ inset = 0, style }: { inset?: number; style?: StyleProp<ViewStyle> }) => (
  <View style={[styles.divider, { marginLeft: inset }, style]} />
);

/** Section heading with an optional trailing link. */
export const SectionHeader = ({
  title,
  action,
  style,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
}) => (
  <View style={[styles.sectionHeader, style]}>
    <Text variant="h3">{title}</Text>
    {action ? (
      <Pressable accessibilityRole="button" hitSlop={hitSlop} onPress={action.onPress}>
        <View style={styles.sectionAction}>
          <Text variant="smallMedium" tone="primary">
            {action.label}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </View>
      </Pressable>
    ) : null}
  </View>
);

/** Circular avatar; falls back to initials so a row never renders empty. */
export const Avatar = ({
  name,
  size = 40,
  tone = 'primary',
}: {
  name: string;
  size?: number;
  tone?: 'primary' | 'neutral' | 'inverse';
}) => {
  const palette =
    tone === 'primary'
      ? { bg: colors.primarySoft, fg: colors.onPrimarySoft }
      : tone === 'inverse'
        ? { bg: 'rgba(255,255,255,0.18)', fg: colors.textInverse }
        : { bg: colors.surfaceAlt, fg: colors.textSecondary };

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.bg },
      ]}
    >
      <Text variant={size >= 44 ? 'h3' : 'smallMedium'} style={{ color: palette.fg }}>
        {initialsOf(name)}
      </Text>
    </View>
  );
};

/** Circular icon button used in headers and over the camera. */
export const IconButton = ({
  icon,
  onPress,
  label,
  size = 40,
  tone = 'surface',
  badge,
  disabled,
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string;
  size?: number;
  tone?: 'surface' | 'primary' | 'ghost' | 'glass' | 'danger';
  badge?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) => {
  const palette = {
    surface: { bg: colors.surface, fg: colors.text, border: colors.border },
    primary: { bg: colors.primary, fg: colors.textOnPrimary, border: 'transparent' },
    ghost: { bg: 'transparent', fg: colors.text, border: 'transparent' },
    glass: { bg: 'rgba(255,255,255,0.16)', fg: colors.textInverse, border: 'rgba(255,255,255,0.25)' },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: 'transparent' },
  }[tone];

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      scaleTo={0.92}
      style={[
        styles.iconButton,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: palette.bg,
          borderColor: palette.border,
        },
        disabled && styles.disabled,
        style,
      ]}
    >
      <Ionicons name={icon} size={size * 0.5} color={palette.fg} />
      {badge && badge > 0 ? (
        <View style={styles.badge}>
          <Text variant="caption" style={styles.badgeText}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </PressableScale>
  );
};

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  count?: number;
  color?: string;
}

/**
 * Horizontally scrolling single-select filter row.
 *
 * Chips beat a dropdown here because the options are few and the current
 * selection stays visible — a filter you cannot see is a filter you forget you
 * applied.
 */
export const ChipRow = <T extends string>({
  options,
  value,
  onChange,
  style,
  contentStyle,
}: {
  options: ChipOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    // These sit under search fields: without this, the first tap on a chip
    // while typing only closes the keyboard and the filter is not applied.
    keyboardShouldPersistTaps="handled"
    style={style}
    contentContainerStyle={[styles.chipRow, contentStyle]}
  >
    {options.map((option) => {
      const isActive = option.value === value;
      const accent = option.color ?? colors.primary;

      return (
        <Pressable
          key={option.value}
          accessibilityRole="button"
          accessibilityState={{ selected: isActive }}
          // Tapping the active chip clears it, which is the fastest way back
          // to "everything".
          onPress={() => onChange(isActive ? null : option.value)}
          style={({ pressed }) => [
            styles.chip,
            isActive
              ? { backgroundColor: accent, borderColor: accent }
              : { backgroundColor: colors.surface, borderColor: colors.border },
            pressed && !isActive && { backgroundColor: colors.surfaceAlt },
          ]}
        >
          {option.icon ? (
            <Ionicons
              name={option.icon}
              size={14}
              color={isActive ? colors.textInverse : colors.textSecondary}
              style={styles.chipIcon}
            />
          ) : null}

          <Text
            variant="smallMedium"
            style={{ color: isActive ? colors.textInverse : colors.textSecondary }}
          >
            {option.label}
          </Text>

          {option.count !== undefined ? (
            <Text
              variant="caption"
              style={[
                styles.chipCount,
                { color: isActive ? colors.textInverse : colors.textMuted },
              ]}
            >
              {option.count}
            </Text>
          ) : null}
        </Pressable>
      );
    })}
  </ScrollView>
);

/** Two-to-four option segmented switch. */
export const SegmentedControl = <T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) => (
  <View style={[styles.segmented, style]}>
    {options.map((option) => {
      const isActive = option.value === value;
      return (
        <Pressable
          key={option.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: isActive }}
          onPress={() => onChange(option.value)}
          style={[styles.segment, isActive && styles.segmentActive]}
        >
          <Text variant="smallMedium" tone={isActive ? 'default' : 'secondary'}>
            {option.label}
          </Text>
        </Pressable>
      );
    })}
  </View>
);

/** Label/value line used in receipts and summaries. */
export const DetailRow = ({
  label,
  value,
  emphasis = false,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: 'default' | 'success' | 'danger' | 'secondary';
}) => (
  <View style={styles.detailRow}>
    <Text variant={emphasis ? 'bodyMedium' : 'body'} tone={emphasis ? 'default' : 'secondary'}>
      {label}
    </Text>
    <Text variant={emphasis ? 'h3' : 'bodyMedium'} tone={tone ?? 'default'}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionAction: { flexDirection: 'row', alignItems: 'center' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  iconButton: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, ...shadows.xs },
  disabled: { opacity: 0.45 },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  badgeText: { color: colors.textInverse, fontSize: 10 },
  chipRow: { paddingHorizontal: spacing.base, gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipIcon: { marginRight: spacing.xs },
  chipCount: { marginLeft: spacing.xs },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  segmentActive: { backgroundColor: colors.surface, ...shadows.xs },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
});
