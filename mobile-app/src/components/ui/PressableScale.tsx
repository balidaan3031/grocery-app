import { useRef, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
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

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, scaleTo] });
  const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1, dimTo] });

  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => animateTo(1)}
      onPressOut={() => animateTo(0)}
      {...rest}
    >
      <Animated.View style={[style, { transform: [{ scale }], opacity }]}>{children}</Animated.View>
    </Pressable>
  );
};
