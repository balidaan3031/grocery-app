import { useCallback, useMemo } from 'react';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Physical feedback for the scanner.
 *
 * The camera is held at arm's length over a barcode, so the screen is often not
 * being looked at when a scan lands. A distinct buzz per outcome lets the
 * cashier keep scanning by feel and only look up when something went wrong.
 *
 * Every call is fire-and-forget: a device without a taptic engine (or with
 * haptics disabled) must not break the scan flow.
 */
const safely = (run: () => Promise<void>): void => {
  if (Platform.OS === 'web') return;
  void run().catch(() => undefined);
};

export const useScanFeedback = () => {
  /** Product found and added — short, crisp. */
  const success = useCallback(() => {
    safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  }, []);

  /** Already in the cart; quantity went up. Lighter than a first add. */
  const bump = useCallback(() => {
    safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  }, []);

  /** Barcode read, but no such product. */
  const notFound = useCallback(() => {
    safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  }, []);

  /** Out of stock, network failure, anything the cashier must resolve. */
  const failure = useCallback(() => {
    safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
  }, []);

  const tap = useCallback(() => {
    safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  }, []);

  // Stable identity, so the camera's scan handler is not rebuilt every render.
  return useMemo(
    () => ({ success, bump, notFound, failure, tap }),
    [success, bump, notFound, failure, tap],
  );
};
