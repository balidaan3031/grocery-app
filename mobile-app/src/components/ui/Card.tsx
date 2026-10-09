import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { PressableScale } from './PressableScale';
import { colors, radius, shadows, spacing } from '../../theme';

interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  /**
   * `raised` floats above the page; `outlined` sits flat inside a section that
   * already has its own surface. Mixing the two in one list is what makes a
   * screen look assembled rather than designed.
   */
  variant?: 'raised' | 'outlined' | 'flat' | 'tinted';
  padding?: keyof typeof spacing | 'none';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const VARIANTS: Record<NonNullable<CardProps['variant']>, StyleProp<ViewStyle>> = {
  raised: [{ backgroundColor: colors.surface }, shadows.sm],
  outlined: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  flat: { backgroundColor: colors.surfaceAlt },
  tinted: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primarySoftBorder },
};

export const Card = ({
  children,
  onPress,
  variant = 'raised',
  padding = 'base',
  style,
  testID,
}: CardProps) => {
  const composed = [
    styles.base,
    VARIANTS[variant],
    padding !== 'none' && { padding: spacing[padding] },
    style,
  ];

  if (onPress) {
    return (
      <PressableScale testID={testID} accessibilityRole="button" onPress={onPress} style={composed}>
        {children}
      </PressableScale>
    );
  }

  return (
    <View testID={testID} style={composed}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
});
