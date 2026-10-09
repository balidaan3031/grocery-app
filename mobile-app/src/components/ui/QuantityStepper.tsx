import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { colors, radius, spacing, typography } from '../../theme';

interface QuantityStepperProps {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  min?: number;
  max?: number;
  busy?: boolean;
  size?: 'sm' | 'md';
  /** Turns the decrement button into a delete affordance at the minimum. */
  removeAtMin?: boolean;
  onRemove?: () => void;
}

/**
 * Quantity control for cart lines.
 *
 * Sized for one-handed use at a counter: both targets clear 40pt, and the count
 * sits between them on tabular figures so the control does not shift width as
 * the number changes from 9 to 10.
 */
export const QuantityStepper = ({
  quantity,
  onIncrement,
  onDecrement,
  min = 1,
  max = 9999,
  busy = false,
  size = 'md',
  removeAtMin = false,
  onRemove,
}: QuantityStepperProps) => {
  const dimensions = size === 'sm' ? SMALL : MEDIUM;
  const atMin = quantity <= min;
  const atMax = quantity >= max;

  const showRemove = removeAtMin && atMin && Boolean(onRemove);
  const decrementDisabled = busy || (atMin && !showRemove);

  return (
    <View style={[styles.container, { height: dimensions.height }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={showRemove ? 'Remove item' : 'Decrease quantity'}
        disabled={decrementDisabled}
        onPress={showRemove ? onRemove : onDecrement}
        style={({ pressed }) => [
          styles.button,
          { width: dimensions.button },
          pressed && styles.pressed,
          decrementDisabled && styles.disabled,
        ]}
      >
        <Ionicons
          name={showRemove ? 'trash-outline' : 'remove'}
          size={dimensions.icon}
          color={showRemove ? colors.danger : decrementDisabled ? colors.textMuted : colors.text}
        />
      </Pressable>

      <View style={[styles.value, { minWidth: dimensions.value }]}>
        {busy ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text style={[typography.numeric, { fontSize: dimensions.fontSize, color: colors.text }]}>
            {quantity}
          </Text>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
        disabled={busy || atMax}
        onPress={onIncrement}
        style={({ pressed }) => [
          styles.button,
          { width: dimensions.button },
          pressed && styles.pressed,
          (busy || atMax) && styles.disabled,
        ]}
      >
        <Ionicons
          name="add"
          size={dimensions.icon}
          color={busy || atMax ? colors.textMuted : colors.primary}
        />
      </Pressable>
    </View>
  );
};

const MEDIUM = { height: 42, button: 42, value: 44, icon: 20, fontSize: 16 };
const SMALL = { height: 34, button: 34, value: 36, icon: 17, fontSize: 14 };

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  button: { height: '100%', alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: colors.border },
  disabled: { opacity: 0.45 },
  value: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxs },
});
