import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ToastHost } from './src/components/ui';

/**
 * Application root.
 *
 * Order matters: the gesture root must wrap everything for navigation gestures
 * to reach the native side, and `ToastHost` sits outside the navigator so
 * feedback survives screen transitions instead of unmounting with the screen
 * that raised it.
 */
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RootNavigator />
        <ToastHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
