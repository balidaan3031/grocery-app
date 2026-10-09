import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from './PressableScale';
import { colors, radius, shadows, spacing, typography } from '../../theme';

type Variant = 'primary' | 'secondary' | 'tonal' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const VARIANTS: Record<Variant, { container: ViewStyle; label: string; elevated?: boolean }> = {
  primary: { container: { backgroundColor: colors.primary }, label: colors.textOnPrimary, elevated: true },
  secondary: {
    container: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
    label: colors.text,
  },
  tonal: {
    container: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primarySoftBorder },
    label: colors.onPrimarySoft,
  },
  ghost: { container: { backgroundColor: 'transparent' }, label: colors.primary },
  danger: { container: { backgroundColor: colors.danger }, label: colors.textInverse, elevated: true },
};

const SIZES: Record<Size, { height: number; paddingHorizontal: number; fontSize: number; icon: number }> = {
  sm: { height: 38, paddingHorizontal: spacing.base, fontSize: 13, icon: 16 },
  md: { height: 48, paddingHorizontal: spacing.lg, fontSize: 15, icon: 18 },
  lg: { height: 56, paddingHorizontal: spacing.xl, fontSize: 16, icon: 20 },
};

/**
 * The app's only button.
 *
 * A loading button keeps its label in place and swaps the icon slot for a
 * spinner, so the control does not change width mid-tap — resizing under the
 * finger is what makes a form feel unstable.
 */
export const Button = ({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  testID,
}: ButtonProps) => {
  const config = VARIANTS[variant];
  const dimensions = SIZES[size];
  const isInert = disabled || loading;

  const content = (
    <>
      {loading ? (
        <ActivityIndicator size="small" color={config.label} style={styles.leading} />
      ) : (
        icon &&
        iconPosition === 'left' && (
          <Ionicons name={icon} size={dimensions.icon} color={config.label} style={styles.leading} />
        )
      )}

      <Text
        numberOfLines={1}
        style={[typography.bodyMedium, { color: config.label, fontSize: dimensions.fontSize }]}
      >
        {label}
      </Text>

      {!loading && icon && iconPosition === 'right' && (
        <Ionicons name={icon} size={dimensions.icon} color={config.label} style={styles.trailing} />
      )}
    </>
  );

  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: isInert, busy: loading }}
      accessibilityLabel={label}
      disabled={isInert}
      onPress={onPress}
      scaleTo={0.96}
      style={[
        styles.base,
        config.container,
        {
          height: dimensions.height,
          paddingHorizontal: dimensions.paddingHorizontal,
        },
        config.elevated && !isInert ? shadows.sm : null,
        fullWidth && styles.fullWidth,
        isInert && styles.inert,
        style,
      ]}
    >
      <View style={styles.row}>{content}</View>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { alignSelf: 'stretch' },
  inert: { opacity: 0.5 },
  leading: { marginRight: spacing.sm },
  trailing: { marginLeft: spacing.sm },
});
