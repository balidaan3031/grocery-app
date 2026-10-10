import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { ToastHost } from './ToastHost';
import { colors, hitSlop, radius, spacing } from '../../theme';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Caps height so a long sheet scrolls rather than covering the screen. */
  maxHeightRatio?: number;
  scrollable?: boolean;
}

/**
 * Bottom sheet used for stock adjustment, filters and confirmations.
 *
 * Deliberately built on the platform `Modal` and the RN animation driver rather
 * than a gesture library: these sheets are short-lived, form-shaped, and always
 * dismissed by a button or the backdrop, so drag-to-dismiss physics would be
 * machinery without a purpose here.
 */
export const Sheet = ({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxHeightRatio = 0.85,
  scrollable = true,
}: SheetProps) => {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const maxHeight = Dimensions.get('window').height * maxHeightRatio;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 220 : 160,
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [400, 0] });

  const body = (
    <View style={styles.body}>
      {children}
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />

      {/* Padding on Android too: the modal window draws edge-to-edge and is
          not resized for the keyboard, which left the lower fields of every
          sheet typing blind underneath it. */}
      <KeyboardAvoidingView behavior="padding" style={styles.wrapper} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.sheet,
            { maxHeight, paddingBottom: insets.bottom + spacing.base, transform: [{ translateY }] },
          ]}
        >
          <View style={styles.grabber} />

          {title ? (
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text variant="h3">{title}</Text>
                {subtitle ? (
                  <Text variant="small" tone="secondary" style={styles.subtitle}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={hitSlop}
                onPress={onClose}
                style={styles.close}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
          ) : null}

          {scrollable ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {body}
            </ScrollView>
          ) : (
            body
          )}

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>

      {/* A modal draws above the app's own toast layer, so feedback raised
          from a sheet ("Passwords do not match", a failed save) would
          otherwise be hidden behind it. */}
      <ToastHost />
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  wrapper: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    // Shrinks to the space left above the keyboard rather than running off
    // the top of the screen; the ScrollView inside takes up the difference.
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingTop: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerText: { flex: 1 },
  subtitle: { marginTop: 2 },
  close: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: { paddingBottom: spacing.sm },
  body: { paddingHorizontal: spacing.lg },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
