import { Pressable, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, hitSlop, radius, spacing, typography } from '../../theme';

interface SearchFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  /** Optional scan shortcut — searching by eye is slower than by barcode. */
  onScanPress?: () => void;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const SearchField = ({
  value,
  onChangeText,
  placeholder = 'Search products, SKU or barcode',
  onScanPress,
  autoFocus = false,
  style,
}: SearchFieldProps) => (
  <View style={[styles.container, style]}>
    <Ionicons name="search" size={18} color={colors.textMuted} />

    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      style={styles.input}
      autoFocus={autoFocus}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
      clearButtonMode="never"
      accessibilityLabel="Search"
    />

    {value.length > 0 ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Clear search"
        hitSlop={hitSlop}
        onPress={() => onChangeText('')}
        style={styles.trailing}
      >
        <Ionicons name="close-circle" size={18} color={colors.textMuted} />
      </Pressable>
    ) : onScanPress ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Scan a barcode"
        hitSlop={hitSlop}
        onPress={onScanPress}
        style={styles.trailing}
      >
        <Ionicons name="barcode-outline" size={20} color={colors.primary} />
      </Pressable>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    marginLeft: spacing.sm,
    paddingVertical: 0,
    color: colors.text,
    ...typography.body,
  },
  trailing: { paddingLeft: spacing.sm },
});
