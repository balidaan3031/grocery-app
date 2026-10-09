import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, spacing } from '../../theme';

interface ScreenProps {
  children: ReactNode;
  /** `scroll` wraps content in a ScrollView; `fixed` is for screens owning a FlatList. */
  mode?: 'fixed' | 'scroll';
  edges?: readonly Edge[];
  background?: 'default' | 'surface' | 'tinted' | 'dark';
  /** Adds horizontal gutters. Off for full-bleed lists that pad their own rows. */
  padded?: boolean;
  /** Lifts content above the keyboard — on for any screen with a text input. */
  avoidKeyboard?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const BACKGROUNDS = {
  default: colors.background,
  surface: colors.surface,
  tinted: colors.backgroundTinted,
  dark: colors.palette.neutral900,
} as const;

/**
 * The page shell every screen sits in.
 *
 * Centralising safe-area edges, background and keyboard avoidance means a new
 * screen inherits correct behaviour on a notched phone without thinking about
 * it, and the whole app stays consistent when one of those rules changes.
 */
export const Screen = ({
  children,
  mode = 'fixed',
  edges = ['top'],
  background = 'default',
  padded = false,
  avoidKeyboard = false,
  contentContainerStyle,
  style,
  testID,
}: ScreenProps) => {
  const body =
    mode === 'scroll' ? (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          padded && styles.padded,
          styles.scrollContent,
          contentContainerStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    ) : (
      <View style={[styles.flex, padded && styles.padded, contentContainerStyle]}>{children}</View>
    );

  const content = avoidKeyboard ? (
    <KeyboardAvoidingView
      style={styles.flex}
      // Android resizes the window itself, so only iOS needs padding behaviour.
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {body}
    </KeyboardAvoidingView>
  ) : (
    body
  );

  return (
    <SafeAreaView
      testID={testID}
      edges={edges}
      style={[styles.flex, { backgroundColor: BACKGROUNDS[background] }, style]}
    >
      {content}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { paddingHorizontal: spacing.base },
  scrollContent: { paddingBottom: spacing.xxl, flexGrow: 1 },
});
