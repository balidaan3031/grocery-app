import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { Button } from './Button';
import { colors, radius, spacing } from '../../theme';

/**
 * Empty, error and loading states.
 *
 * Kept together because they are the same idea — the screen has nothing useful
 * to render yet — and because a list needs all three within a few lines of each
 * other. A blank screen with a spinner tells the user nothing about what is
 * missing or what to do next; each of these says both.
 */

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap };
  secondaryAction?: { label: string; onPress: () => void };
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const EmptyState = ({
  icon = 'file-tray-outline',
  title,
  message,
  action,
  secondaryAction,
  compact = false,
  style,
}: EmptyStateProps) => (
  <View style={[styles.center, compact ? styles.compact : styles.full, style]}>
    <View style={styles.iconWrap}>
      <Ionicons name={icon} size={30} color={colors.primary} />
    </View>

    <Text variant="h3" center style={styles.title}>
      {title}
    </Text>

    {message ? (
      <Text variant="body" tone="secondary" center style={styles.message}>
        {message}
      </Text>
    ) : null}

    {action ? (
      <Button
        label={action.label}
        icon={action.icon}
        onPress={action.onPress}
        style={styles.action}
      />
    ) : null}

    {secondaryAction ? (
      <Button
        label={secondaryAction.label}
        variant="ghost"
        size="sm"
        onPress={secondaryAction.onPress}
        style={styles.secondary}
      />
    ) : null}
  </View>
);

export const ErrorState = ({
  title = 'Something went wrong',
  message,
  onRetry,
  compact = false,
  style,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) => (
  <View style={[styles.center, compact ? styles.compact : styles.full, style]}>
    <View style={[styles.iconWrap, styles.errorIconWrap]}>
      <Ionicons name="cloud-offline-outline" size={30} color={colors.danger} />
    </View>

    <Text variant="h3" center style={styles.title}>
      {title}
    </Text>

    {message ? (
      <Text variant="body" tone="secondary" center style={styles.message}>
        {message}
      </Text>
    ) : null}

    {onRetry ? (
      <Button label="Try again" icon="refresh" variant="secondary" onPress={onRetry} style={styles.action} />
    ) : null}
  </View>
);

export const LoadingState = ({ label, compact = false }: { label?: string; compact?: boolean }) => (
  <View style={[styles.center, compact ? styles.compact : styles.full]}>
    <ActivityIndicator size="large" color={colors.primary} />
    {label ? (
      <Text variant="small" tone="secondary" style={styles.loadingLabel}>
        {label}
      </Text>
    ) : null}
  </View>
);

/**
 * Shimmering placeholder block.
 *
 * Skeletons stand in for content whose shape is already known — a product row,
 * a stat tile — so the layout does not jump when the data lands. A spinner is
 * for work whose result has no predictable shape.
 */
export const Skeleton = ({
  width = '100%',
  height = 16,
  rounded = radius.sm,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
}) => {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: rounded, backgroundColor: colors.surfaceAlt, opacity: pulse },
        style,
      ]}
    />
  );
};

/** Skeleton in the shape of a product/inventory row. */
export const RowSkeleton = () => (
  <View style={styles.rowSkeleton}>
    <Skeleton width={56} height={56} rounded={radius.md} />
    <View style={styles.rowSkeletonBody}>
      <Skeleton width="70%" height={14} />
      <Skeleton width="40%" height={12} style={styles.rowSkeletonLine} />
    </View>
    <Skeleton width={54} height={22} rounded={radius.pill} />
  </View>
);

export const ListSkeleton = ({ count = 6 }: { count?: number }) => (
  <View style={styles.listSkeleton}>
    {Array.from({ length: count }, (_, index) => (
      <RowSkeleton key={index} />
    ))}
  </View>
);

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  full: { flex: 1, paddingVertical: spacing.xxxl },
  compact: { paddingVertical: spacing.xxl },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  errorIconWrap: { backgroundColor: colors.dangerSoft },
  title: { marginBottom: spacing.xs },
  message: { maxWidth: 300 },
  action: { marginTop: spacing.lg },
  secondary: { marginTop: spacing.xs },
  loadingLabel: { marginTop: spacing.md },
  rowSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  rowSkeletonBody: { flex: 1, marginLeft: spacing.md },
  rowSkeletonLine: { marginTop: spacing.sm },
  listSkeleton: { paddingTop: spacing.sm },
});
