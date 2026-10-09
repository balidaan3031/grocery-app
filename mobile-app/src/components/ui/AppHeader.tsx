import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { colors, hitSlop, radius, spacing } from '../../theme';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  /** Shows a chevron that pops the stack. Omit on tab roots. */
  showBack?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  /** Large titles read better on list roots; compact suits pushed screens. */
  size?: 'compact' | 'large';
  border?: boolean;
}

export const AppHeader = ({
  title,
  subtitle,
  showBack = false,
  onBack,
  right,
  size = 'compact',
  border = false,
}: AppHeaderProps) => {
  const navigation = useNavigation();

  const handleBack = () => {
    if (onBack) return onBack();
    if (navigation.canGoBack()) navigation.goBack();
  };

  return (
    <View style={[styles.container, border && styles.bordered]}>
      <View style={styles.row}>
        {showBack && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={hitSlop}
            onPress={handleBack}
            style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
        )}

        <View style={styles.titles}>
          <Text variant={size === 'large' ? 'h1' : 'h2'} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="small" tone="secondary" numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: 'transparent',
  },
  bordered: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
    marginLeft: -spacing.sm,
  },
  backPressed: { backgroundColor: colors.surfaceAlt },
  titles: { flex: 1, justifyContent: 'center' },
  subtitle: { marginTop: 2 },
  right: { flexDirection: 'row', alignItems: 'center', marginLeft: spacing.sm },
});
