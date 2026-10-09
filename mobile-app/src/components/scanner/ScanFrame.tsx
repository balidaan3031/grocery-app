import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors, radius } from '../../theme';

interface ScanFrameProps {
  size: number;
  /** Pauses the sweep while a scan resolves, so motion means "listening". */
  active: boolean;
  tone?: 'idle' | 'success' | 'error';
}

const TONES = {
  idle: colors.scannerFrame,
  success: colors.palette.green300,
  error: colors.palette.red500,
} as const;

/**
 * The reticle over the camera feed.
 *
 * Four corner brackets plus a sweeping line: the brackets tell the user where
 * to put the barcode, and the sweep is the only thing on screen that says the
 * camera is live. Freezing it during a lookup is deliberate feedback — the app
 * has stopped listening for a moment.
 *
 * All animation is on transform/opacity via the native driver, so the sweep
 * stays smooth even while a request is in flight on the JS thread.
 */
export const ScanFrame = ({ size, active, tone = 'idle' }: ScanFrameProps) => {
  const sweep = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const color = TONES[tone];

  useEffect(() => {
    if (!active) {
      sweep.stopAnimation();
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, {
          toValue: 1,
          duration: 1900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(sweep, {
          toValue: 0,
          duration: 1900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [active, sweep]);

  // A brief flare on the frame when the tone changes confirms the read.
  useEffect(() => {
    if (tone === 'idle') return;
    pulse.setValue(1);
    Animated.timing(pulse, {
      toValue: 0,
      duration: 550,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [tone, pulse]);

  const translateY = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [8, size - 8],
  });

  const corner = Math.max(size * 0.18, 28);

  return (
    <View style={[styles.frame, { width: size, height: size }]} pointerEvents="none">
      <Animated.View
        style={[
          styles.flare,
          { borderColor: color, opacity: pulse, transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] },
        ]}
      />

      <View style={[styles.corner, styles.topLeft, { width: corner, height: corner, borderColor: color }]} />
      <View style={[styles.corner, styles.topRight, { width: corner, height: corner, borderColor: color }]} />
      <View style={[styles.corner, styles.bottomLeft, { width: corner, height: corner, borderColor: color }]} />
      <View style={[styles.corner, styles.bottomRight, { width: corner, height: corner, borderColor: color }]} />

      {active ? (
        <Animated.View style={[styles.sweep, { backgroundColor: color, transform: [{ translateY }] }]}>
          <View style={[styles.sweepGlow, { backgroundColor: color }]} />
        </Animated.View>
      ) : null}
    </View>
  );
};

const BORDER = 3.5;

const styles = StyleSheet.create({
  frame: { alignSelf: 'center' },
  flare: {
    ...StyleSheet.absoluteFill,
    borderWidth: 2,
    borderRadius: radius.xl,
  },
  corner: { position: 'absolute' },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: BORDER,
    borderLeftWidth: BORDER,
    borderTopLeftRadius: radius.lg,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: BORDER,
    borderRightWidth: BORDER,
    borderTopRightRadius: radius.lg,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: BORDER,
    borderLeftWidth: BORDER,
    borderBottomLeftRadius: radius.lg,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: BORDER,
    borderRightWidth: BORDER,
    borderBottomRightRadius: radius.lg,
  },
  sweep: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: 2,
    borderRadius: 1,
    opacity: 0.9,
  },
  sweepGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -9,
    height: 20,
    opacity: 0.18,
    borderRadius: 10,
  },
});
