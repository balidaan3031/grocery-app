import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/ui/Text';
import { colors, radius, shadows, spacing } from '../../theme';

/**
 * Shown while the stored session is restored and revalidated.
 *
 * The mark fades and lifts rather than appearing instantly, which reads as
 * "starting up" instead of "stuck" during the second or so the token check
 * takes on a cold network.
 */
export const SplashScreen = () => {
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(enter, {
      toValue: 1,
      useNativeDriver: true,
      speed: 8,
      bounciness: 5,
    }).start();
  }, [enter]);

  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });

  return (
    <LinearGradient
      colors={[colors.palette.green600, colors.palette.green500, colors.palette.teal500]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <Animated.View style={[styles.content, { opacity: enter, transform: [{ translateY }, { scale }] }]}>
        <View style={styles.mark}>
          <Ionicons name="basket" size={44} color={colors.palette.green600} />
        </View>

        <Text variant="display" style={styles.title}>
          Fresh Mart
        </Text>
        <Text variant="body" style={styles.subtitle}>
          Point of sale &amp; inventory
        </Text>
      </Animated.View>

      <ActivityIndicator color={colors.textInverse} style={styles.loader} />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'center' },
  mark: {
    width: 92,
    height: 92,
    borderRadius: radius.xxl,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    ...shadows.lg,
  },
  title: { color: colors.textInverse },
  subtitle: { color: 'rgba(255,255,255,0.85)', marginTop: spacing.xs },
  loader: { position: 'absolute', bottom: spacing.huge },
});
