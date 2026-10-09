import { useEffect } from 'react';
import { NavigationContainer, type Theme as NavTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { TabNavigator } from './TabNavigator';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { SplashScreen } from '../screens/auth/SplashScreen';
import { ProductDetailScreen } from '../screens/products/ProductDetailScreen';
import { ProductFormScreen } from '../screens/products/ProductFormScreen';
import { CartScreen } from '../screens/cart/CartScreen';
import { CheckoutScreen } from '../screens/cart/CheckoutScreen';
import { OrderSuccessScreen } from '../screens/orders/OrderSuccessScreen';
import { OrderDetailScreen } from '../screens/orders/OrderDetailScreen';
import { StockAdjustScreen } from '../screens/inventory/StockAdjustScreen';
import { MovementHistoryScreen } from '../screens/inventory/MovementHistoryScreen';
import { BarcodeCaptureScreen } from '../screens/scanner/BarcodeCaptureScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { StaffScreen } from '../screens/admin/StaffScreen';
import { CategoriesScreen } from '../screens/admin/CategoriesScreen';
import { useAuthStore, selectIsAuthenticated } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import { colors } from '../theme';
import type { AuthStackParamList, RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

const navigationTheme: NavTheme = {
  dark: false,
  colors: {
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.danger,
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium: { fontFamily: 'System', fontWeight: '500' },
    bold: { fontFamily: 'System', fontWeight: '600' },
    heavy: { fontFamily: 'System', fontWeight: '700' },
  },
};

const AuthNavigator = () => (
  <AuthStack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
    <AuthStack.Screen name="Login" component={LoginScreen} />
  </AuthStack.Navigator>
);

const AppNavigator = () => (
  <RootStack.Navigator
    screenOptions={{
      headerShown: false,
      // Screens draw their own AppHeader, so the native header is off
      // everywhere; this keeps one header implementation instead of two.
      animation: 'slide_from_right',
      contentStyle: { backgroundColor: colors.background },
    }}
  >
    <RootStack.Screen name="Tabs" component={TabNavigator} />
    <RootStack.Screen name="ProductDetail" component={ProductDetailScreen} />
    <RootStack.Screen name="ProductForm" component={ProductFormScreen} />
    <RootStack.Screen name="Cart" component={CartScreen} />
    <RootStack.Screen name="Checkout" component={CheckoutScreen} />
    <RootStack.Screen
      name="OrderSuccess"
      component={OrderSuccessScreen}
      // No back gesture: the sale is done, and swiping back to a checkout form
      // for a completed order invites a double charge.
      options={{ gestureEnabled: false, animation: 'fade' }}
    />
    <RootStack.Screen name="OrderDetail" component={OrderDetailScreen} />
    <RootStack.Screen name="StockAdjust" component={StockAdjustScreen} />
    <RootStack.Screen name="MovementHistory" component={MovementHistoryScreen} />
    <RootStack.Screen
      name="BarcodeCapture"
      component={BarcodeCaptureScreen}
      options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
    />
    <RootStack.Screen name="Profile" component={ProfileScreen} />
    <RootStack.Screen name="Staff" component={StaffScreen} />
    <RootStack.Screen name="Categories" component={CategoriesScreen} />
  </RootStack.Navigator>
);

export const RootNavigator = () => {
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const loadCart = useCartStore((state) => state.load);
  const resetCart = useCartStore((state) => state.reset);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // The cart belongs to the signed-in user: opened on sign-in, discarded on
  // sign-out so the next person at the till never inherits someone else's.
  useEffect(() => {
    if (isAuthenticated) void loadCart({ silent: true });
    else resetCart();
  }, [isAuthenticated, loadCart, resetCart]);

  return (
    <NavigationContainer theme={navigationTheme}>
      <StatusBar style="dark" />
      {isBootstrapping ? <SplashScreen /> : isAuthenticated ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
};
