import { useCallback, useEffect, useRef } from 'react';
import { Animated, BackHandler, Easing, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Divider, ErrorState, LoadingState, Text } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { ordersApi } from '../../services/api';
import { colors, radius, shadows, spacing, typography } from '../../theme';
import { PAYMENT_LABELS, formatCurrency, formatDateTime, pluralise } from '../../utils/format';
import type { RootScreenProps, RootStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export const OrderSuccessScreen = ({ route }: RootScreenProps<'OrderSuccess'>) => {
  const navigation = useNavigation<Navigation>();
  const { orderId } = route.params;

  const fetchOrder = useCallback(() => ordersApi.byId(orderId), [orderId]);
  const { data: order, isLoading, error, reload } = useAsync(fetchOrder);

  const pop = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 12 }),
      Animated.timing(ring, {
        toValue: 1,
        duration: 620,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [pop, ring]);

  /**
   * Hardware back must not return to checkout — the sale is complete, and a
   * second confirmation there would attempt to charge again.
   */
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        navigation.navigate('Tabs', { screen: 'Scanner' });
        return true;
      });
      return () => subscription.remove();
    }, [navigation]),
  );

  const startNewSale = () => navigation.navigate('Tabs', { screen: 'Scanner' });

  if (isLoading && !order) {
    return (
      <SafeAreaView style={styles.screen}>
        <LoadingState label="Finalising order…" />
      </SafeAreaView>
    );
  }

  // The sale went through; only the receipt failed to load. Say so, rather
  // than presenting a ₹0.00 receipt.
  if (error && !order) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <ErrorState
          title="Sale completed"
          message={`The receipt could not be loaded: ${error}`}
          onRetry={reload}
        />
        <View style={styles.footer}>
          <Button label="New sale" icon="scan" size="lg" fullWidth onPress={startNewSale} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.markWrap}>
            <Animated.View
              style={[
                styles.ring,
                {
                  opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                  transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }],
                },
              ]}
            />
            <Animated.View style={[styles.mark, { transform: [{ scale: pop }] }]}>
              <Ionicons name="checkmark" size={44} color={colors.textInverse} />
            </Animated.View>
          </View>

          <Text variant="h1" center style={styles.title}>
            Payment received
          </Text>
          <Text variant="body" tone="secondary" center>
            Stock has been updated and the sale is recorded.
          </Text>

          <Text style={[typography.numeric, styles.total]}>
            {formatCurrency(order?.total_amount ?? 0)}
          </Text>
        </View>

        <Card variant="outlined" style={styles.receipt}>
          <View style={styles.receiptHeader}>
            <View>
              <Text variant="caption" tone="muted">
                ORDER
              </Text>
              <Text variant="h3">{order?.order_number ?? '—'}</Text>
            </View>

            <View style={styles.paidBadge}>
              <Ionicons name="checkmark-circle" size={13} color={colors.onSuccessSoft} />
              <Text variant="caption" tone="success" style={styles.paidText}>
                PAID
              </Text>
            </View>
          </View>

          <Text variant="small" tone="muted" style={styles.timestamp}>
            {order?.created_at ? formatDateTime(order.created_at) : ''}
            {order?.cashier_name ? ` · ${order.cashier_name}` : ''}
          </Text>

          <Divider style={styles.divider} />

          {/* An itemised list, because this screen doubles as the receipt the
              cashier reads back to the customer */}
          {order?.items.map((item) => (
            <View key={item.id} style={styles.lineItem}>
              <View style={styles.lineQty}>
                <Text style={[typography.numeric, styles.lineQtyText]}>{item.quantity}×</Text>
              </View>

              <View style={styles.lineBody}>
                <Text variant="body" numberOfLines={1}>
                  {item.product_name}
                </Text>
                <Text variant="caption" tone="muted">
                  {formatCurrency(item.unit_price)} each
                  {item.tax_rate > 0 ? ` · ${item.tax_rate}% tax` : ''}
                </Text>
              </View>

              <Text style={[typography.numeric, styles.lineTotal]}>
                {formatCurrency(item.line_total)}
              </Text>
            </View>
          ))}

          <Divider style={styles.divider} />

          <SummaryRow label="Subtotal" value={formatCurrency(order?.subtotal ?? 0)} />
          {(order?.tax_amount ?? 0) > 0 ? (
            <SummaryRow label="Tax" value={formatCurrency(order?.tax_amount ?? 0)} />
          ) : null}
          {(order?.discount_amount ?? 0) > 0 ? (
            <SummaryRow
              label="Discount"
              value={`− ${formatCurrency(order?.discount_amount ?? 0)}`}
              tone={colors.success}
            />
          ) : null}
          <SummaryRow
            label={`Paid by ${PAYMENT_LABELS[order?.payment_method ?? 'cash']}`}
            value={formatCurrency(order?.total_amount ?? 0)}
            emphasis
          />

          <View style={styles.itemCount}>
            <Ionicons name="cube-outline" size={13} color={colors.textMuted} />
            <Text variant="caption" tone="muted" style={styles.itemCountText}>
              {pluralise(order?.item_count ?? 0, 'unit')} sold across{' '}
              {pluralise(order?.items.length ?? 0, 'line')}
            </Text>
          </View>
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="New sale" icon="scan" size="lg" fullWidth onPress={startNewSale} />
        <View style={styles.footerRow}>
          <Button
            label="Order details"
            variant="secondary"
            onPress={() => navigation.replace('OrderDetail', { orderId })}
            style={styles.footerButton}
          />
          <Button
            label="Done"
            variant="ghost"
            onPress={() => navigation.navigate('Tabs', { screen: 'Dashboard' })}
            style={styles.footerButton}
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

const SummaryRow = ({
  label,
  value,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: string;
}) => (
  <View style={styles.summaryRow}>
    <Text variant={emphasis ? 'bodyMedium' : 'body'} tone={emphasis ? 'default' : 'secondary'}>
      {label}
    </Text>
    <Text
      style={[
        typography.numeric,
        { fontSize: emphasis ? 18 : 15, color: tone ?? colors.text },
      ]}
    >
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: spacing.xl },
  hero: { alignItems: 'center', paddingVertical: spacing.xl },
  markWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  ring: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary,
  },
  mark: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.primary,
  },
  title: { marginBottom: spacing.xs },
  total: { fontSize: 34, lineHeight: 42, color: colors.text, marginTop: spacing.lg },
  receipt: { padding: spacing.lg },
  receiptHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  paidText: { marginLeft: spacing.xs, letterSpacing: 0.6 },
  timestamp: { marginTop: spacing.xs },
  divider: { marginVertical: spacing.base },
  lineItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  lineQty: {
    minWidth: 34,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.xs,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
  },
  lineQtyText: { fontSize: 13, color: colors.textSecondary },
  lineBody: { flex: 1, marginHorizontal: spacing.md },
  lineTotal: { fontSize: 14, color: colors.text },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  itemCount: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.base,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  itemCountText: { marginLeft: spacing.xs },
  footer: {
    padding: spacing.base,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footerRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  footerButton: { flex: 1 },
});
