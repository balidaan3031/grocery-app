import { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import {
  AppHeader,
  Badge,
  Button,
  Card,
  Divider,
  ErrorState,
  IconButton,
  LoadingState,
  Screen,
  SectionHeader,
  StockBadge,
  Text,
} from '../../components/ui';
import { MovementRow } from '../../components/inventory/MovementRow';
import { ProductImage } from '../../components/products/ProductImage';
import { useAsync } from '../../hooks/useAsync';
import { productsApi } from '../../services/api';
import { useAuthStore, selectIsAdmin } from '../../store/authStore';
import { useCartStore, selectCartCount } from '../../store/cartStore';
import { toast } from '../../store/uiStore';
import { colors, radius, shadows, spacing, typography } from '../../theme';
import { formatBarcode, formatCurrency, formatDate } from '../../utils/format';
import { messageOf, stockDetailsOf } from '../../utils/errors';
import type { RootScreenProps, RootStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export const ProductDetailScreen = ({ route }: RootScreenProps<'ProductDetail'>) => {
  const navigation = useNavigation<Navigation>();
  const { productId } = route.params;

  const isAdmin = useAuthStore(selectIsAdmin);
  const cartCount = useCartStore(selectCartCount);
  const addProduct = useCartStore((state) => state.addProduct);

  const fetchProduct = useCallback(() => productsApi.byId(productId), [productId]);
  const fetchMovements = useCallback(() => productsApi.movements(productId), [productId]);

  const { data: product, isLoading, isRefreshing, error, reload, refresh } = useAsync(fetchProduct, {
    refetchOnFocus: true,
  });
  const { data: movements, refresh: refreshMovements } = useAsync(fetchMovements, {
    refetchOnFocus: true,
  });

  const handleRefresh = () => {
    void refresh();
    void refreshMovements();
  };

  const handleAddToCart = async () => {
    if (!product) return;
    try {
      await addProduct(product.id, 1);
      toast.success('Added to cart', product.name);
    } catch (caught) {
      const stock = stockDetailsOf(caught);
      toast.error(
        'Could not add',
        stock ? `Only ${stock.available} ${product.unit} left.` : messageOf(caught),
      );
    }
  };

  const [isChangingStatus, setIsChangingStatus] = useState(false);

  const handleDeactivate = () => {
    if (!product) return;

    Alert.alert(
      `Deactivate ${product.name}?`,
      'It will stop appearing in the catalogue and cannot be scanned into a cart. Past orders keep their records, and you can reactivate it from Products → deactivated products at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            setIsChangingStatus(true);
            try {
              await productsApi.deactivate(product.id);
              toast.success('Product deactivated', product.name);
              // Stay on the product so an accidental tap is one button away from undone.
              await refresh();
            } catch (caught) {
              toast.error('Could not deactivate', messageOf(caught));
            } finally {
              setIsChangingStatus(false);
            }
          },
        },
      ],
    );
  };

  const handleReactivate = async () => {
    if (!product) return;
    setIsChangingStatus(true);
    try {
      await productsApi.restore(product.id);
      toast.success('Product reactivated', `${product.name} can be scanned and sold again.`);
      await refresh();
    } catch (caught) {
      toast.error('Could not reactivate', messageOf(caught));
    } finally {
      setIsChangingStatus(false);
    }
  };

  if (isLoading && !product) {
    return (
      <Screen edges={['top']}>
        <AppHeader title="Product" showBack />
        <LoadingState />
      </Screen>
    );
  }

  if (error && !product) {
    return (
      <Screen edges={['top']}>
        <AppHeader title="Product" showBack />
        <ErrorState message={error} onRetry={reload} />
      </Screen>
    );
  }

  if (!product) return null;

  const margin = product.selling_price - product.purchase_price;
  const marginPercent =
    product.selling_price > 0 ? Math.round((margin / product.selling_price) * 100) : 0;
  const isOutOfStock = product.stock_status === 'out_of_stock';
  const isInactive = !product.is_active;

  return (
    <Screen edges={['top']}>
      <AppHeader
        title="Product"
        showBack
        right={
          <View style={styles.headerActions}>
            <IconButton
              icon="cart-outline"
              label={`Open cart, ${cartCount} items`}
              badge={cartCount}
              size={38}
              onPress={() => navigation.navigate('Cart')}
            />
            {isAdmin ? (
              <IconButton
                icon="create-outline"
                label="Edit product"
                size={38}
                onPress={() => navigation.navigate('ProductForm', { productId: product.id })}
              />
            ) : null}
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {isInactive ? (
          <Card variant="flat" style={styles.inactiveCard}>
            <View style={styles.inactiveHeader}>
              <Ionicons name="archive-outline" size={18} color={colors.onWarningSoft} />
              <Text variant="bodyMedium" tone="warning" style={styles.inactiveTitle}>
                Deactivated
              </Text>
            </View>
            <Text variant="small" tone="secondary">
              Hidden from the catalogue and refused at the till. Stock and history are kept.
            </Text>
            {isAdmin ? (
              <Button
                label="Reactivate product"
                icon="refresh-outline"
                size="sm"
                loading={isChangingStatus}
                onPress={handleReactivate}
                style={styles.inactiveButton}
              />
            ) : null}
          </Card>
        ) : null}

        <View style={styles.hero}>
          {product.image_url ? (
            <Image
              source={{ uri: product.image_url }}
              style={styles.heroImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
              accessibilityLabel={product.name}
            />
          ) : (
            <ProductImage
              uri={null}
              name={product.name}
              accent={product.category_color}
              icon={product.category_icon}
              size={140}
              rounded={radius.xl}
            />
          )}
        </View>

        <View style={styles.titleBlock}>
          {product.category_name ? (
            <Badge
              label={product.category_name}
              tone="primary"
              icon={(product.category_icon as never) ?? undefined}
              size="sm"
              style={styles.categoryBadge}
            />
          ) : null}

          <Text variant="h1" style={styles.name}>
            {product.name}
          </Text>

          {product.description ? (
            <Text variant="body" tone="secondary" style={styles.description}>
              {product.description}
            </Text>
          ) : null}

          <View style={styles.priceRow}>
            <Text style={[typography.numeric, styles.price]}>
              {formatCurrency(product.selling_price)}
            </Text>
            <Text variant="small" tone="muted">
              per {product.unit}
              {product.tax_rate > 0 ? ` · ${product.tax_rate}% tax` : ''}
            </Text>
          </View>
        </View>

        {/* Stock is the thing a shopkeeper opens this screen to check */}
        <Card variant="outlined" style={styles.stockCard}>
          <View style={styles.stockHeader}>
            <View>
              <Text variant="caption" tone="muted">
                CURRENT STOCK
              </Text>
              <View style={styles.stockValueRow}>
                <Text style={[typography.numeric, styles.stockValue]}>{product.quantity}</Text>
                <Text variant="body" tone="secondary" style={styles.stockUnit}>
                  {product.unit}
                </Text>
              </View>
            </View>

            <StockBadge status={product.stock_status} />
          </View>

          <View style={styles.stockMeta}>
            <Text variant="small" tone="secondary">
              Alerts below {product.low_stock_threshold} {product.unit}
            </Text>
            {product.last_counted_at ? (
              <Text variant="caption" tone="muted">
                Last counted {formatDate(product.last_counted_at)}
              </Text>
            ) : null}
          </View>

          <View style={styles.stockActions}>
            {/* The ledger function refuses inactive products, so do not offer it */}
            {isInactive ? null : (
              <Button
                label="Adjust stock"
                icon="swap-vertical-outline"
                variant="secondary"
                size="sm"
                onPress={() => navigation.navigate('StockAdjust', { productId: product.id })}
                style={styles.stockButton}
              />
            )}
            <Button
              label="Full history"
              icon="time-outline"
              variant="ghost"
              size="sm"
              onPress={() => navigation.navigate('MovementHistory', { productId: product.id })}
              style={styles.stockButton}
            />
          </View>
        </Card>

        {/* Identifiers */}
        <Card variant="outlined" style={styles.section}>
          <Text variant="h3" style={styles.sectionTitle}>
            Identifiers
          </Text>

          <InfoRow icon="barcode-outline" label="Barcode" value={formatBarcode(product.barcode)} mono />
          <Divider />
          <InfoRow icon="pricetag-outline" label="SKU" value={product.sku} mono />
          <Divider />
          <InfoRow icon="cube-outline" label="Sold by" value={product.unit} />
        </Card>

        {/* Pricing — admin only: staff sell, they do not set margins */}
        {isAdmin ? (
          <Card variant="outlined" style={styles.section}>
            <Text variant="h3" style={styles.sectionTitle}>
              Pricing
            </Text>

            <View style={styles.pricingGrid}>
              <PriceBlock label="Cost" value={formatCurrency(product.purchase_price)} />
              <PriceBlock label="Sells for" value={formatCurrency(product.selling_price)} />
              <PriceBlock
                label="Margin"
                value={formatCurrency(margin)}
                caption={`${marginPercent}%`}
                tone={margin >= 0 ? colors.success : colors.danger}
              />
            </View>

            <View style={styles.stockWorth}>
              <Ionicons name="wallet-outline" size={15} color={colors.textSecondary} />
              <Text variant="small" tone="secondary" style={styles.stockWorthText}>
                Stock on hand is worth {formatCurrency(product.stock_retail_value)} at retail
              </Text>
            </View>
          </Card>
        ) : null}

        {/* Recent ledger entries, with a link to the rest */}
        <View style={styles.section}>
          <SectionHeader
            title="Stock activity"
            action={
              movements && movements.length > 3
                ? {
                    label: 'See all',
                    onPress: () => navigation.navigate('MovementHistory', { productId: product.id }),
                  }
                : undefined
            }
          />

          {movements && movements.length > 0 ? (
            <View style={styles.movements}>
              {movements.slice(0, 3).map((movement) => (
                <MovementRow key={movement.id} movement={movement} showProduct={false} />
              ))}
            </View>
          ) : (
            <Card variant="flat" style={styles.emptyMovements}>
              <Ionicons name="time-outline" size={20} color={colors.textMuted} />
              <Text variant="small" tone="secondary" style={styles.emptyMovementsText}>
                No stock movements recorded yet.
              </Text>
            </Card>
          )}
        </View>

        {isAdmin && !isInactive ? (
          <Button
            label="Deactivate product"
            icon="archive-outline"
            variant="ghost"
            loading={isChangingStatus}
            onPress={handleDeactivate}
            style={styles.deactivate}
          />
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={isInactive ? 'Deactivated' : isOutOfStock ? 'Out of stock' : 'Add to cart'}
          icon={
            isInactive ? 'archive-outline' : isOutOfStock ? 'close-circle-outline' : 'cart-outline'
          }
          size="lg"
          fullWidth
          disabled={isInactive || isOutOfStock}
          onPress={handleAddToCart}
        />
      </View>
    </Screen>
  );
};

const InfoRow = ({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  mono?: boolean;
}) => (
  <View style={styles.infoRow}>
    <Ionicons name={icon} size={17} color={colors.textMuted} />
    <Text variant="body" tone="secondary" style={styles.infoLabel}>
      {label}
    </Text>
    <Text
      variant="bodyMedium"
      style={mono ? [typography.numeric, styles.infoMono] : undefined}
      numberOfLines={1}
    >
      {value}
    </Text>
  </View>
);

const PriceBlock = ({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: string;
  caption?: string;
  tone?: string;
}) => (
  <View style={styles.priceBlock}>
    <Text variant="caption" tone="muted">
      {label.toUpperCase()}
    </Text>
    <Text style={[typography.numeric, styles.priceBlockValue, tone ? { color: tone } : null]}>
      {value}
    </Text>
    {caption ? (
      <Text variant="caption" tone="muted">
        {caption}
      </Text>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  content: { padding: spacing.base, paddingBottom: spacing.xl },
  inactiveCard: { backgroundColor: colors.warningSoft, marginBottom: spacing.sm },
  inactiveHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  inactiveTitle: { marginLeft: spacing.sm },
  inactiveButton: { alignSelf: 'flex-start', marginTop: spacing.md },
  hero: { alignItems: 'center', paddingVertical: spacing.base },
  heroImage: {
    width: 180,
    height: 180,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceAlt,
  },
  titleBlock: { marginBottom: spacing.lg },
  categoryBadge: { marginBottom: spacing.sm },
  name: { marginBottom: spacing.xs },
  description: { marginBottom: spacing.md },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  price: { fontSize: 26, color: colors.primary },

  stockCard: { padding: spacing.lg },
  stockHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  stockValueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  stockValue: { fontSize: 30, color: colors.text },
  stockUnit: { marginLeft: spacing.xs },
  stockMeta: { marginTop: spacing.md, gap: 2 },
  stockActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.base },
  stockButton: { flex: 1 },

  section: { marginTop: spacing.base },
  sectionTitle: { marginBottom: spacing.sm },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  infoLabel: { flex: 1, marginLeft: spacing.md },
  infoMono: { fontSize: 15, color: colors.text },

  pricingGrid: { flexDirection: 'row', gap: spacing.sm },
  priceBlock: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  priceBlockValue: { fontSize: 16, color: colors.text, marginVertical: 2 },
  stockWorth: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  stockWorthText: { marginLeft: spacing.sm, flex: 1 },

  movements: { gap: spacing.sm },
  emptyMovements: { flexDirection: 'row', alignItems: 'center' },
  emptyMovementsText: { flex: 1, marginLeft: spacing.md },

  deactivate: { marginTop: spacing.lg },

  footer: {
    padding: spacing.base,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    ...shadows.lg,
  },
});
