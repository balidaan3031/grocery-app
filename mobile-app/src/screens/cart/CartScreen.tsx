import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import {
  AppHeader,
  Button,
  Divider,
  EmptyState,
  IconButton,
  QuantityStepper,
  Screen,
  Text,
} from '../../components/ui';
import { ProductImage } from '../../components/products/ProductImage';
import { PressableScale } from '../../components/ui/PressableScale';
import { useCartStore } from '../../store/cartStore';
import { toast } from '../../store/uiStore';
import { colors, radius, shadows, spacing, typography } from '../../theme';
import { formatCurrency, pluralise } from '../../utils/format';
import { messageOf, stockDetailsOf } from '../../utils/errors';
import type { CartItem } from '../../types';
import type { RootStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export const CartScreen = () => {
  const navigation = useNavigation<Navigation>();
  // Footers sit on the bottom edge, under the home indicator or nav bar.
  const insets = useSafeAreaInsets();

  const cart = useCartStore((state) => state.cart);
  const isLoading = useCartStore((state) => state.isLoading);
  const pendingItemIds = useCartStore((state) => state.pendingItemIds);
  const load = useCartStore((state) => state.load);
  const increment = useCartStore((state) => state.increment);
  const decrement = useCartStore((state) => state.decrement);
  const removeItem = useCartStore((state) => state.removeItem);
  const clear = useCartStore((state) => state.clear);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load({ silent: true });
    setIsRefreshing(false);
  }, [load]);

  // Stock limits on each line come from the last fetch; other tills sell from
  // the same shelves, so pick up the current figures whenever the cart opens.
  useFocusEffect(
    useCallback(() => {
      void load({ silent: true });
    }, [load]),
  );

  const handleClear = () => {
    Alert.alert('Clear cart?', 'This removes every item from the current sale.', [
      { text: 'Keep items', style: 'cancel' },
      {
        text: 'Clear cart',
        style: 'destructive',
        onPress: () => {
          clear()
            .then(() => toast.info('Cart cleared'))
            .catch((error: unknown) => toast.error('Could not clear the cart', messageOf(error)));
        },
      },
    ]);
  };

  const handleQuantityError = (error: unknown) => {
    // The store already rolled the optimistic change back; this is only about
    // telling the cashier why the shelf disagreed.
    const stock = stockDetailsOf(error);
    toast.error(
      stock ? 'Not enough stock' : 'Could not update quantity',
      stock ? `Only ${stock.available} of ${stock.productName} left.` : messageOf(error),
    );
  };

  const handleRemove = (itemId: string) => {
    removeItem(itemId).catch((error: unknown) =>
      toast.error('Could not remove the item', messageOf(error)),
    );
  };

  const items = cart?.items ?? [];
  const totals = cart?.totals;
  const isEmpty = items.length === 0;

  const renderItem = ({ item }: { item: CartItem }) => {
    const isPending = pendingItemIds.includes(item.id);
    const atStockLimit = item.quantity >= item.product.quantity;

    return (
      <View style={styles.item}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`View ${item.product.name}`}
          onPress={() => navigation.navigate('ProductDetail', { productId: item.product_id })}
          scaleTo={0.97}
        >
          <ProductImage
            uri={item.product.image_url}
            name={item.product.name}
            size={58}
          />
        </PressableScale>

        <View style={styles.itemBody}>
          <Text variant="bodyMedium" numberOfLines={2}>
            {item.product.name}
          </Text>

          <Text variant="small" tone="muted" style={styles.itemMeta}>
            {formatCurrency(item.unit_price)} / {item.product.unit}
            {item.tax_rate > 0 ? ` · ${item.tax_rate}% tax` : ''}
          </Text>

          <View style={styles.itemFooter}>
            <QuantityStepper
              quantity={item.quantity}
              busy={isPending}
              max={item.product.quantity}
              removeAtMin
              onRemove={() => handleRemove(item.id)}
              onIncrement={() => {
                if (atStockLimit) {
                  toast.warning(
                    'Stock limit reached',
                    `Only ${item.product.quantity} ${item.product.unit} available.`,
                  );
                  return;
                }
                void increment(item.id).catch(handleQuantityError);
              }}
              onDecrement={() => void decrement(item.id).catch(handleQuantityError)}
              size="sm"
            />

            <Text style={[typography.numeric, styles.lineTotal]}>
              {formatCurrency(item.lineTotal)}
            </Text>
          </View>

          {atStockLimit ? (
            <View style={styles.stockNote}>
              <Ionicons name="information-circle-outline" size={12} color={colors.onWarningSoft} />
              <Text variant="caption" tone="warning" style={styles.stockNoteText}>
                All remaining stock is in this cart
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <Screen edges={['top']}>
      <AppHeader
        title="Cart"
        subtitle={isEmpty ? 'No items yet' : pluralise(totals?.itemCount ?? 0, 'item')}
        showBack
        right={
          isEmpty ? undefined : (
            <IconButton icon="trash-outline" label="Clear cart" tone="danger" size={38} onPress={handleClear} />
          )
        }
      />

      {isEmpty ? (
        <EmptyState
          icon="cart-outline"
          title="Your cart is empty"
          message="Scan a barcode or pick a product from the catalogue to start a sale."
          action={{
            label: 'Scan a product',
            icon: 'scan',
            onPress: () => navigation.navigate('Tabs', { screen: 'Scanner' }),
          }}
          secondaryAction={{
            label: 'Browse products',
            onPress: () => navigation.navigate('Tabs', { screen: 'Products' }),
          }}
        />
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <Divider inset={spacing.base} />}
            showsVerticalScrollIndicator={false}
            refreshing={isRefreshing || isLoading}
            onRefresh={handleRefresh}
            ListFooterComponent={
              <PressableScale
                accessibilityRole="button"
                onPress={() => navigation.navigate('Tabs', { screen: 'Scanner' })}
                style={styles.addMore}
              >
                <Ionicons name="scan-outline" size={18} color={colors.primary} />
                <Text variant="smallMedium" tone="primary" style={styles.addMoreText}>
                  Scan another item
                </Text>
              </PressableScale>
            }
          />

          {/* Summary docked above the fold: the total must never require a scroll */}
          <View style={[styles.summary, { paddingBottom: spacing.lg + insets.bottom }]}>
            <View style={styles.summaryRow}>
              <Text variant="small" tone="secondary">
                Subtotal ({pluralise(totals?.distinctItems ?? 0, 'line')})
              </Text>
              <Text style={[typography.numeric, styles.summaryValue]}>
                {formatCurrency(totals?.subtotal ?? 0)}
              </Text>
            </View>

            {(totals?.taxAmount ?? 0) > 0 ? (
              <View style={styles.summaryRow}>
                <Text variant="small" tone="secondary">
                  Tax
                </Text>
                <Text style={[typography.numeric, styles.summaryValue]}>
                  {formatCurrency(totals?.taxAmount ?? 0)}
                </Text>
              </View>
            ) : null}

            <Divider style={styles.summaryDivider} />

            <View style={styles.summaryRow}>
              <Text variant="h3">Total</Text>
              <Text style={[typography.numeric, styles.grandTotal]}>
                {formatCurrency(totals?.total ?? 0)}
              </Text>
            </View>

            <Button
              label="Proceed to checkout"
              icon="arrow-forward"
              iconPosition="right"
              size="lg"
              fullWidth
              onPress={() => navigation.navigate('Checkout')}
              style={styles.checkout}
            />
          </View>
        </>
      )}
    </Screen>
  );
};

const styles = StyleSheet.create({
  list: { paddingBottom: spacing.base },
  item: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.surface,
  },
  itemBody: { flex: 1, marginLeft: spacing.md },
  itemMeta: { marginTop: 2 },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  lineTotal: { fontSize: 16, color: colors.text },
  stockNote: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  stockNoteText: { marginLeft: spacing.xs },
  addMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.base,
    marginHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primarySoftBorder,
    backgroundColor: colors.primarySoft,
  },
  addMoreText: { marginLeft: spacing.sm },
  summary: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    paddingBottom: spacing.lg,
    ...shadows.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  summaryValue: { fontSize: 15, color: colors.text },
  summaryDivider: { marginVertical: spacing.sm },
  grandTotal: { fontSize: 24, color: colors.primary },
  checkout: { marginTop: spacing.base },
});
