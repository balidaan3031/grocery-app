import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { useUiStore, type Toast, type ToastTone } from '../../store/uiStore';
import { colors, radius, shadows, spacing } from '../../theme';

const TONES: Record<ToastTone, { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  success: { bg: colors.palette.green600, fg: colors.textInverse, icon: 'checkmark-circle' },
  error: { bg: colors.palette.red600, fg: colors.textInverse, icon: 'alert-circle' },
  warning: { bg: colors.palette.amber700, fg: colors.textInverse, icon: 'warning' },
  info: { bg: colors.palette.neutral800, fg: colors.textInverse, icon: 'information-circle' },
};

const ToastCard = ({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) => {
  const tone = TONES[toast.tone];
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(enter, {
      toValue: 1,
      useNativeDriver: true,
      speed: 16,
      bounciness: 6,
    }).start();
  }, [enter]);

  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] });

  return (
    <Animated.View
      style={[
        styles.toast,
        shadows.lg,
        { backgroundColor: tone.bg, opacity: enter, transform: [{ translateY }] },
      ]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Ionicons name={tone.icon} size={20} color={tone.fg} />

      <View style={styles.body}>
        <Text variant="bodyMedium" style={{ color: tone.fg }} numberOfLines={2}>
          {toast.title}
        </Text>
        {toast.message ? (
          <Text variant="small" style={[styles.message, { color: tone.fg }]} numberOfLines={3}>
            {toast.message}
          </Text>
        ) : null}
      </View>

      {toast.action ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            toast.action?.onPress();
            onDismiss();
          }}
          style={styles.actionButton}
        >
          <Text variant="smallMedium" style={{ color: tone.fg }}>
            {toast.action.label}
          </Text>
        </Pressable>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss}>
          <Ionicons name="close" size={18} color={tone.fg} />
        </Pressable>
      )}
    </Animated.View>
  );
};

/**
 * Renders the toast queue above everything else.
 *
 * Mounted once at the app root, outside the navigator, so feedback raised
 * during a screen transition (a scan that resolves as the scanner closes) still
 * has somewhere to appear.
 */
export const ToastHost = () => {
  const toasts = useUiStore((state) => state.toasts);
  const dismiss = useUiStore((state) => state.dismiss);
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View style={[styles.host, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: spacing.base,
    right: spacing.base,
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  body: { flex: 1, marginHorizontal: spacing.md },
  message: { marginTop: 2, opacity: 0.9 },
  actionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
});
