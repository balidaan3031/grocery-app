import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  Avatar,
  Card,
  ErrorState,
  IconButton,
  ListSkeleton,
  SectionHeader,
  StatTile,
  StockBadge,
  Text,
} from '../../components/ui';
import { SalesTrend } from '../../components/dashboard/SalesTrend';
import { OrderRow } from '../../components/orders/OrderRow';
import { ProductImage } from '../../components/products/ProductImage';
import { useAsync } from '../../hooks/useAsync';
import { dashboardApi } from '../../services/api';
import { useAuthStore, selectIsAdmin } from '../../store/authStore';
import { useCartStore, selectCartCount } from '../../store/cartStore';
import { colors, radius, shadows, spacing, typography } from '../../theme';
import { formatCompactCurrency, formatCurrency, formatNumber, pluralise } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

const greeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

export const DashboardScreen = () => {
  const navigation = useNavigation<Navigation>();
  const user = useAuthStore((state) => state.user);
  const isAdmin = useAuthStore(selectIsAdmin);
  const storeName = useAuthStore((state) => state.config?.storeName ?? 'Fresh Mart');
  const cartCount = useCartStore(selectCartCount);

  const fetchDashboard = useCallback(
    () => dashboardApi.overview({ trendDays: 7, recentLimit: 4, lowStockLimit: 4 }),
    [],
  );

  // Refetched on focus: sales and stock change while the user is on other
  // screens, and a stale dashboard is worse than a slightly slower one.
  const { data, isLoading, isRefreshing, error, reload, refresh } = useAsync(fetchDashboard, {
    refetchOnFocus: true,
  });

  const goToTabs = (screen: 'Products' | 'Inventory' | 'Orders' | 'Scanner') =>
    navigation.navigate('Tabs', { screen });

  if (isLoading && !data) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.loadingHeader} />
        <ListSkeleton count={5} />
      </SafeAreaView>
    );
  }

  if (error && !data) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ErrorState message={error} onRetry={reload} />
      </SafeAreaView>
    );
  }

  const stats = data?.stats;
  const inventory = data?.inventory;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
      >
        {/* Identity + the two things always needed: cart and profile */}
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open your profile"
            onPress={() => navigation.navigate('Profile')}
            style={styles.identity}
          >
            <Avatar name={user?.fullName || 'Store User'} size={44} />
            <View style={styles.identityText}>
              <Text variant="small" tone="secondary">
                {greeting()}
              </Text>
              <Text variant="h3" numberOfLines={1}>
                {user?.fullName?.trim().split(/\s+/)[0] || 'there'}
              </Text>
            </View>
          </Pressable>

          <IconButton
            icon="cart-outline"
            label={`Open cart, ${cartCount} items`}
            badge={cartCount}
            onPress={() => navigation.navigate('Cart')}
          />
        </View>

        {/* Hero: today's takings, with the week's shape behind it */}
        <LinearGradient
          colors={[colors.palette.green600, colors.palette.green500, colors.palette.teal600]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTop}>
            <View style={styles.heroLabelRow}>
              <Ionicons name="trending-up" size={14} color="rgba(255,255,255,0.9)" />
              <Text variant="caption" style={styles.heroLabel}>
                TODAY&apos;S SALES
              </Text>
            </View>
            <Text variant="caption" style={styles.heroStore} numberOfLines={1}>
              {storeName}
            </Text>
          </View>

          <Text style={[typography.numeric, styles.heroValue]} adjustsFontSizeToFit numberOfLines={1}>
            {formatCurrency(stats?.todaySales ?? 0)}
          </Text>

          <View style={styles.heroMeta}>
            <View style={styles.heroChip}>
              <Ionicons name="receipt-outline" size={13} color={colors.textInverse} />
              <Text variant="caption" style={styles.heroChipText}>
                {pluralise(stats?.todayOrders ?? 0, 'order')} today
              </Text>
            </View>
            <View style={styles.heroChip}>
              <Ionicons name="cube-outline" size={13} color={colors.textInverse} />
              <Text variant="caption" style={styles.heroChipText}>
                {formatNumber(stats?.inventoryUnits ?? 0)} units in stock
              </Text>
            </View>
          </View>

          {data?.salesTrend?.length ? (
            <View style={styles.heroChart}>
              <SalesTrend data={data.salesTrend} onDark />
            </View>
          ) : null}
        </LinearGradient>

        {/* Quick actions — scan is the one that matters, so it is the widest */}
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan a product"
            onPress={() => goToTabs('Scanner')}
            style={({ pressed }) => [styles.scanAction, pressed && styles.actionPressed]}
          >
            <View style={styles.scanIcon}>
              <Ionicons name="scan" size={22} color={colors.textOnPrimary} />
            </View>
            <View style={styles.scanText}>
              <Text variant="bodyMedium">Scan a product</Text>
              <Text variant="small" tone="secondary">
                Add straight to the cart
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>

          <View style={styles.actionRow}>
            {/* Only admins can create products; staff get the cart instead. */}
            {isAdmin ? (
              <QuickAction
                icon="add-circle-outline"
                label="Add product"
                onPress={() => navigation.navigate('ProductForm', {})}
              />
            ) : (
              <QuickAction icon="cart-outline" label="Cart" onPress={() => navigation.navigate('Cart')} />
            )}
            <QuickAction
              icon="swap-vertical-outline"
              label="Adjust stock"
              onPress={() => goToTabs('Inventory')}
            />
            <QuickAction
              icon="time-outline"
              label="Stock log"
              onPress={() => navigation.navigate('MovementHistory')}
            />
          </View>
        </View>

        {/* Headline counts */}
        <View style={styles.tiles}>
          <StatTile
            label="Products"
            value={formatNumber(stats?.totalProducts ?? 0)}
            icon="pricetags-outline"
            tone="primary"
            caption={`${stats?.totalCategories ?? 0} categories`}
            onPress={() => goToTabs('Products')}
          />
          <StatTile
            label="Low stock"
            value={formatNumber(stats?.lowStockCount ?? 0)}
            icon="alert-circle-outline"
            tone="warning"
            caption="Needs restocking"
            onPress={() => goToTabs('Inventory')}
          />
        </View>

        <View style={styles.tiles}>
          <StatTile
            label="Out of stock"
            value={formatNumber(stats?.outOfStockCount ?? 0)}
            icon="close-circle-outline"
            tone="danger"
            caption="Cannot be sold"
            onPress={() => goToTabs('Inventory')}
          />
          <StatTile
            label="Total orders"
            value={formatNumber(stats?.totalOrders ?? 0)}
            icon="receipt-outline"
            tone="accent"
            caption={`${formatCompactCurrency(stats?.totalSales ?? 0)} lifetime`}
            onPress={() => goToTabs('Orders')}
          />
        </View>

        {/* Inventory value at a glance */}
        {inventory ? (
          <Card variant="outlined" style={styles.section}>
            <SectionHeader
              title="Inventory"
              action={{ label: 'Manage', onPress: () => goToTabs('Inventory') }}
            />

            <View style={styles.inventoryRow}>
              <InventoryStat label="In stock" value={formatNumber(inventory.inStock)} tone={colors.success} />
              <InventoryStat label="Low" value={formatNumber(inventory.lowStock)} tone={colors.warning} />
              <InventoryStat label="Out" value={formatNumber(inventory.outOfStock)} tone={colors.danger} />
            </View>

            <View style={styles.valueRow}>
              <View style={styles.valueBlock}>
                <Text variant="caption" tone="muted">
                  RETAIL VALUE
                </Text>
                <Text style={[typography.numeric, styles.valueText]}>
                  {formatCompactCurrency(inventory.retailValue)}
                </Text>
              </View>
              <View style={styles.valueDivider} />
              <View style={styles.valueBlock}>
                <Text variant="caption" tone="muted">
                  STOCK COST
                </Text>
                <Text style={[typography.numeric, styles.valueText]}>
                  {formatCompactCurrency(inventory.costValue)}
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        {/* Restock worklist */}
        {data?.lowStockProducts?.length ? (
          <View style={styles.section}>
            <SectionHeader
              title="Running low"
              action={{ label: 'See all', onPress: () => goToTabs('Inventory') }}
            />

            <View style={styles.list}>
              {data.lowStockProducts.map((product) => (
                <Pressable
                  key={product.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${product.name}, ${product.quantity} left`}
                  onPress={() => navigation.navigate('ProductDetail', { productId: product.id })}
                  style={({ pressed }) => [styles.lowStockRow, pressed && styles.actionPressed]}
                >
                  <ProductImage
                    uri={product.image_url}
                    name={product.name}
                    accent={product.category_color}
                    icon={product.category_icon}
                    size={40}
                  />
                  <View style={styles.lowStockBody}>
                    <Text variant="bodyMedium" numberOfLines={1}>
                      {product.name}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      Threshold {product.low_stock_threshold} {product.unit}
                    </Text>
                  </View>
                  <StockBadge
                    status={product.stock_status}
                    quantity={product.quantity}
                    unit={product.unit}
                    size="sm"
                  />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {/* Recent activity */}
        <View style={styles.section}>
          <SectionHeader
            title="Recent orders"
            action={{ label: 'See all', onPress: () => goToTabs('Orders') }}
          />

          {data?.recentOrders?.length ? (
            <View style={styles.list}>
              {data.recentOrders.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  compact
                  onPress={() => navigation.navigate('OrderDetail', { orderId: order.id })}
                />
              ))}
            </View>
          ) : (
            <Card variant="flat" style={styles.emptyOrders}>
              <Ionicons name="receipt-outline" size={22} color={colors.textMuted} />
              <Text variant="small" tone="secondary" style={styles.emptyOrdersText}>
                No sales yet today. Scan a product to start an order.
              </Text>
            </Card>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const QuickAction = ({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    style={({ pressed }) => [styles.quickAction, pressed && styles.actionPressed]}
  >
    <Ionicons name={icon} size={20} color={colors.primary} />
    <Text variant="caption" tone="secondary" center style={styles.quickActionLabel} numberOfLines={2}>
      {label}
    </Text>
  </Pressable>
);

const InventoryStat = ({ label, value, tone }: { label: string; value: string; tone: string }) => (
  <View style={styles.inventoryStat}>
    <View style={[styles.inventoryDot, { backgroundColor: tone }]} />
    <Text style={[typography.numeric, styles.inventoryValue]}>{value}</Text>
    <Text variant="caption" tone="muted">
      {label}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: spacing.xxxl },
  loadingHeader: { height: 60 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  identity: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  identityText: { marginLeft: spacing.md, flex: 1 },

  hero: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.base,
    ...shadows.md,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  heroLabel: { color: 'rgba(255,255,255,0.9)' },
  heroStore: { color: 'rgba(255,255,255,0.7)', maxWidth: 130 },
  heroValue: { color: colors.textInverse, fontSize: 36, lineHeight: 44, marginTop: spacing.sm },
  heroMeta: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  heroChipText: { color: colors.textInverse },
  heroChart: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.25)',
  },

  actions: { marginBottom: spacing.base },
  scanAction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    ...shadows.xs,
  },
  actionPressed: { opacity: 0.7 },
  scanIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanText: { flex: 1, marginLeft: spacing.md },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionLabel: { marginTop: spacing.xs },

  tiles: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },

  section: { marginTop: spacing.lg },
  list: { gap: spacing.sm },

  inventoryRow: { flexDirection: 'row', marginBottom: spacing.base },
  inventoryStat: { flex: 1, alignItems: 'center' },
  inventoryDot: { width: 8, height: 8, borderRadius: 4, marginBottom: spacing.xs },
  inventoryValue: { fontSize: 18, color: colors.text },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  valueBlock: { flex: 1, alignItems: 'center' },
  valueDivider: { width: StyleSheet.hairlineWidth, height: 30, backgroundColor: colors.borderStrong },
  valueText: { fontSize: 17, color: colors.text, marginTop: 2 },

  lowStockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lowStockBody: { flex: 1, marginHorizontal: spacing.md },

  emptyOrders: { flexDirection: 'row', alignItems: 'center' },
  emptyOrdersText: { flex: 1, marginLeft: spacing.md },
});
