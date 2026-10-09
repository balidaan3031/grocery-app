import { Platform, Pressable, StyleSheet, View } from 'react-native';
import {
  createBottomTabNavigator,
  type BottomTabBarButtonProps,
} from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { ProductListScreen } from '../screens/products/ProductListScreen';
import { ScannerScreen } from '../screens/scanner/ScannerScreen';
import { InventoryScreen } from '../screens/inventory/InventoryScreen';
import { OrderHistoryScreen } from '../screens/orders/OrderHistoryScreen';
import { Text } from '../components/ui/Text';
import { colors, shadows, spacing } from '../theme';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

const ICONS: Record<keyof TabParamList, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Dashboard: { active: 'grid', inactive: 'grid-outline' },
  Products: { active: 'pricetags', inactive: 'pricetags-outline' },
  Scanner: { active: 'scan', inactive: 'scan-outline' },
  Inventory: { active: 'layers', inactive: 'layers-outline' },
  Orders: { active: 'receipt', inactive: 'receipt-outline' },
};

/**
 * Raised centre button for Scan.
 *
 * Scanning is the action this app exists for and the one repeated hundreds of
 * times a shift, so it gets the largest, most reachable target on the screen
 * rather than an equal share of a five-way tab bar.
 */
const ScanTabButton = ({ onPress, accessibilityState }: BottomTabBarButtonProps) => (
  <View style={styles.scanSlot}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Scan a product"
      accessibilityState={accessibilityState}
      onPress={onPress}
      style={({ pressed }) => [styles.scanButton, pressed && styles.scanButtonPressed]}
    >
      <Ionicons name="scan" size={26} color={colors.textOnPrimary} />
    </Pressable>
  </View>
);

export const TabNavigator = () => {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: [
          styles.tabBar,
          { height: 58 + insets.bottom, paddingBottom: insets.bottom || spacing.sm },
        ],
        tabBarLabel: ({ focused, color }) =>
          route.name === 'Scanner' ? null : (
            <Text variant="caption" style={{ color, fontWeight: focused ? '600' : '500' }}>
              {route.name}
            </Text>
          ),
        tabBarIcon: ({ focused, color, size }) =>
          route.name === 'Scanner' ? null : (
            <Ionicons
              name={focused ? ICONS[route.name].active : ICONS[route.name].inactive}
              size={size - 2}
              color={color}
            />
          ),
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="Products" component={ProductListScreen} />
      <Tab.Screen
        name="Scanner"
        component={ScannerScreen}
        options={{
          tabBarButton: (props) => <ScanTabButton {...props} />,
        }}
      />
      <Tab.Screen name="Inventory" component={InventoryScreen} />
      <Tab.Screen name="Orders" component={OrderHistoryScreen} />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    ...Platform.select({
      ios: { shadowColor: colors.palette.neutral900, shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: -4 } },
      default: { elevation: 12 },
    }),
  },
  scanSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scanButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    // Lifted above the bar so it reads as the primary action, not a fifth tab.
    marginTop: -22,
    borderWidth: 4,
    borderColor: colors.surface,
    ...shadows.primary,
  },
  scanButtonPressed: { backgroundColor: colors.primaryPressed, transform: [{ scale: 0.94 }] },
});
