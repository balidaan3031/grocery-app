import { forwardRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { colors, hitSlop, radius, spacing, typography } from '../../theme';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Trailing affordance, e.g. a scan shortcut on the barcode field. */
  action?: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; label: string };
  /** Renders a currency symbol or unit inside the field. */
  prefix?: string;
  suffix?: string;
  containerStyle?: StyleProp<ViewStyle>;
  required?: boolean;
}

/**
 * Form input with label, focus ring and inline error.
 *
 * The error slot is only rendered when there is one, but the field's border
 * colour carries the state too — colour alone would be invisible to anyone who
 * cannot distinguish it.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(
  (
    {
      label,
      error,
      hint,
      icon,
      action,
      prefix,
      suffix,
      containerStyle,
      required,
      secureTextEntry,
      onFocus,
      onBlur,
      ...rest
    },
    ref,
  ) => {
    const [isFocused, setIsFocused] = useState(false);
    const [isHidden, setIsHidden] = useState(Boolean(secureTextEntry));

    const borderColor = error
      ? colors.danger
      : isFocused
        ? colors.primary
        : colors.border;

    return (
      <View style={containerStyle}>
        {label ? (
          <View style={styles.labelRow}>
            <Text variant="smallMedium" tone="secondary">
              {label}
            </Text>
            {required ? (
              <Text variant="smallMedium" tone="danger" style={styles.required}>
                *
              </Text>
            ) : null}
          </View>
        ) : null}

        <View
          // Always its own native container. The focus ring adds a shadow and an
          // Android elevation, and either decides whether the renderer mounts
          // this view's children inside it or hoists them into its parent.
          // Flipping that on focus moved the TextInput to another native
          // parent, which drops focus — so every tap on a field undid itself.
          collapsable={false}
          style={[
            styles.field,
            rest.multiline && styles.fieldMultiline,
            { borderColor, backgroundColor: isFocused ? colors.surface : colors.surfaceAlt },
            isFocused && styles.focusRing,
          ]}
        >
          {icon ? (
            <Ionicons
              name={icon}
              size={18}
              color={isFocused ? colors.primary : colors.textMuted}
              style={[styles.icon, rest.multiline && styles.iconMultiline]}
            />
          ) : null}

          {prefix ? (
            <Text variant="body" tone="secondary" style={styles.affix}>
              {prefix}
            </Text>
          ) : null}

          <TextInput
            ref={ref}
            style={[styles.input, rest.multiline && styles.inputMultiline]}
            placeholderTextColor={colors.textMuted}
            secureTextEntry={isHidden}
            onFocus={(event) => {
              setIsFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setIsFocused(false);
              onBlur?.(event);
            }}
            {...rest}
          />

          {suffix ? (
            <Text variant="small" tone="muted" style={styles.affix}>
              {suffix}
            </Text>
          ) : null}

          {secureTextEntry ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isHidden ? 'Show password' : 'Hide password'}
              hitSlop={hitSlop}
              onPress={() => setIsHidden((current) => !current)}
              style={styles.trailing}
            >
              <Ionicons
                name={isHidden ? 'eye-outline' : 'eye-off-outline'}
                size={19}
                color={colors.textMuted}
              />
            </Pressable>
          ) : null}

          {action ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={action.label}
              hitSlop={hitSlop}
              onPress={action.onPress}
              style={styles.trailing}
            >
              <Ionicons name={action.icon} size={20} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>

        {error ? (
          <View style={styles.messageRow}>
            <Ionicons name="alert-circle" size={13} color={colors.danger} />
            <Text variant="small" tone="danger" style={styles.message}>
              {error}
            </Text>
          </View>
        ) : hint ? (
          <Text variant="small" tone="muted" style={styles.hint}>
            {hint}
          </Text>
        ) : null}
      </View>
    );
  },
);

TextField.displayName = 'TextField';

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  required: { marginLeft: 2 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  focusRing: {
    // A tinted halo rather than a hard outline: visible without shouting.
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 1,
  },
  // Multiline text starts at the top beside a top-aligned icon, instead of
  // floating in the middle of a tall box (Android's default).
  fieldMultiline: { alignItems: 'flex-start' },
  icon: { marginRight: spacing.sm },
  // Centres the icon on the first line of text.
  iconMultiline: { marginTop: spacing.md + 2 },
  affix: { marginHorizontal: spacing.xxs },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    color: colors.text,
    ...typography.body,
  },
  inputMultiline: { minHeight: 84, textAlignVertical: 'top' },
  trailing: { paddingLeft: spacing.sm },
  messageRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  message: { marginLeft: spacing.xs, flex: 1 },
  hint: { marginTop: spacing.xs },
});
