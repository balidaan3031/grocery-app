import { useRef, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** How far to shrink on press. Larger surfaces need less travel to read. */
  scaleTo?: number;
  dimTo?: number;
}

/**
 * The pressable itself is animated, so the caller's style — `flex: 1`,
 * `alignSelf`, margins — lands on the element its parent lays out. Styling an
 * inner view instead left buttons in a row and tiles in a grid sized to their
 * content rather than sharing the space.
 */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A press target that shrinks slightly under the finger.
 *
 * Built on the RN `Animated` driver rather than Reanimated: these are two
 * interpolations on transform and opacity, both `useNativeDriver`-eligible, so
 * they already run off the JS thread and stay smooth while a list is scrolling
 * or a scan is resolving.
 */
export const PressableScale = ({
  children,
  style,
  scaleTo = 0.97,
  dimTo = 0.9,
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) => {
  const progress = useRef(new Animated.Value(0)).current;

  const animateTo = (value: number) => {
    Animated.spring(progress, {
      toValue: value,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
  };

  // The animated opacity replaces any opacity in `style`, so start from the
  // caller's value: otherwise a disabled button's dimming never shows.
  const styleOpacity = StyleSheet.flatten(style)?.opacity;
  const baseOpacity = typeof styleOpacity === 'number' ? styleOpacity : 1;
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, scaleTo] });
  const opacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [baseOpacity, baseOpacity * dimTo],
  });

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={(event) => {
        animateTo(1);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        animateTo(0);
        onPressOut?.(event);
      }}
      {...rest}
      style={[style, { transform: [{ scale }], opacity }]}
    >
      {children}
    </AnimatedPressable>
  );
};
