import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import {
  AppHeader,
  Badge,
  Card,
  Divider,
  ErrorState,
  LoadingState,
  Screen,
  Text,
} from '../../components/ui';
import { PressableScale } from '../../components/ui/PressableScale';
import { useAsync } from '../../hooks/useAsync';
import { ordersApi } from '../../services/api';
import { colors, radius, spacing, typography } from '../../theme';
import { PAYMENT_LABELS, formatBarcode, formatCurrency, formatDateTime, pluralise } from '../../utils/format';
import type { OrderStatus } from '../../types';
import type { RootScreenProps, RootStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

const STATUS_TONE: Record<OrderStatus, 'success' | 'warning' | 'neutral' | 'info'> = {
  completed: 'success',
  pending: 'warning',
  cancelled: 'neutral',
  refunded: 'info',
};

export const OrderDetailScreen = ({ route }: RootScreenProps<'OrderDetail'>) => {
  const navigation = useNavigation<Navigation>();
  const { orderId } = route.params;

  const fetchOrder = useCallback(() => ordersApi.byId(orderId), [orderId]);
  const { data: order, isLoading, isRefreshing, error, reload, refresh } = useAsync(fetchOrder);

  if (isLoading && !order) {
    return (
      <Screen edges={['top', 'bottom']}>
        <AppHeader title="Order" showBack />
        <LoadingState />
      </Screen>
    );
  }

  if (error && !order) {
    return (
      <Screen edges={['top', 'bottom']}>
        <AppHeader title="Order" showBack />
        <ErrorState message={error} onRetry={reload} />
      </Screen>
    );
  }

  if (!order) return null;

  return (
    <Screen edges={['top', 'bottom']}>
      <AppHeader title={order.order_number} subtitle={formatDateTime(order.created_at)} showBack />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
      >
        {/* Headline: what was paid, how, and whether it settled */}
        <Card variant="tinted" style={styles.summaryCard}>
          <Text variant="caption" tone="secondary">
            TOTAL PAID
          </Text>
          <Text style={[typography.numeric, styles.total]} adjustsFontSizeToFit numberOfLines={1}>
            {formatCurrency(order.total_amount)}
          </Text>

          <View style={styles.badges}>
            <Badge
              label={order.status[0]!.toUpperCase() + order.status.slice(1)}
              tone={STATUS_TONE[order.status]}
              size="sm"
              dot
            />
            <Badge
              label={PAYMENT_LABELS[order.payment_method] ?? order.payment_method}
              tone="neutral"
              size="sm"
              icon="wallet-outline"
            />
            <Badge
              label={order.payment_status === 'paid' ? 'Paid' : order.payment_status}
              tone={order.payment_status === 'paid' ? 'success' : 'warning'}
              size="sm"
            />
          </View>
        </Card>

        {/* Line items — the receipt */}
        <Card variant="outlined" style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="h3">Items</Text>
            <Text variant="small" tone="muted">
              {pluralise(order.item_count, 'unit')}
            </Text>
          </View>

          {order.items.map((item, index) => (
            <View key={item.id}>
              {index > 0 ? <Divider /> : null}

              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={`View ${item.product_name}`}
                disabled={!item.product_id}
                onPress={() =>
                  item.product_id &&
                  navigation.navigate('ProductDetail', { productId: item.product_id })
                }
                style={styles.lineItem}
              >
                <View style={styles.qtyBadge}>
                  <Text style={[typography.numeric, styles.qtyText]}>{item.quantity}</Text>
                </View>

                <View style={styles.lineBody}>
                  <Text variant="bodyMedium" numberOfLines={2}>
                    {item.product_name}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {item.barcode ? formatBarcode(item.barcode) : (item.sku ?? '')} ·{' '}
                    {formatCurrency(item.unit_price)} each
                    {item.tax_rate > 0 ? ` · ${item.tax_rate}% tax` : ''}
                  </Text>
                </View>

                <Text style={[typography.numeric, styles.lineTotal]}>
                  {formatCurrency(item.line_total)}
                </Text>
              </PressableScale>
            </View>
          ))}

          <Divider style={styles.totalsDivider} />

          <SummaryLine label="Subtotal" value={formatCurrency(order.subtotal)} />
          {order.tax_amount > 0 ? (
            <SummaryLine label="Tax" value={formatCurrency(order.tax_amount)} />
          ) : null}
          {order.discount_amount > 0 ? (
            <SummaryLine
              label="Discount"
              value={`− ${formatCurrency(order.discount_amount)}`}
              tone={colors.success}
            />
          ) : null}
          <SummaryLine label="Total" value={formatCurrency(order.total_amount)} emphasis />
        </Card>

        {/* Payments: modelled one-to-many, so split tenders render without change */}
        {order.payments.length > 0 ? (
          <Card variant="outlined" style={styles.section}>
            <Text variant="h3" style={styles.sectionTitle}>
              Payment
            </Text>

            {order.payments.map((payment, index) => (
              <View key={payment.id}>
                {index > 0 ? <Divider /> : null}
                <View style={styles.paymentRow}>
                  <View style={styles.paymentIcon}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  </View>
                  <View style={styles.paymentBody}>
                    <Text variant="bodyMedium">
                      {PAYMENT_LABELS[payment.method] ?? payment.method}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {payment.reference ? `Ref ${payment.reference} · ` : ''}
                      {payment.paid_at ? formatDateTime(payment.paid_at) : 'Pending'}
                    </Text>
                  </View>
                  <Text style={[typography.numeric, styles.paymentAmount]}>
                    {formatCurrency(payment.amount)}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        {/* Who and for whom */}
        <Card variant="outlined" style={styles.section}>
          <Text variant="h3" style={styles.sectionTitle}>
            Details
          </Text>

          <MetaRow icon="person-outline" label="Cashier" value={order.cashier_name ?? 'Unknown'} />
          {order.customer_name ? (
            <>
              <Divider />
              <MetaRow icon="people-outline" label="Customer" value={order.customer_name} />
            </>
          ) : null}
          {order.customer_phone ? (
            <>
              <Divider />
              <MetaRow icon="call-outline" label="Phone" value={order.customer_phone} />
            </>
          ) : null}
          <Divider />
          <MetaRow
            icon="time-outline"
            label="Completed"
            value={order.completed_at ? formatDateTime(order.completed_at) : '—'}
          />

          {order.notes ? (
            <>
              <Divider />
              <View style={styles.notes}>
                <Text variant="caption" tone="muted">
                  NOTES
                </Text>
                <Text variant="body" style={styles.notesText}>
                  {order.notes}
                </Text>
              </View>
            </>
          ) : null}
        </Card>

        <View style={styles.ledgerNote}>
          <Ionicons name="shield-checkmark-outline" size={14} color={colors.textMuted} />
          <Text variant="caption" tone="muted" style={styles.ledgerNoteText}>
            Stock for this order was deducted in the same transaction that created it. See the stock
            history for the matching movements.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
};

const SummaryLine = ({
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
  <View style={styles.summaryLine}>
    <Text variant={emphasis ? 'bodyMedium' : 'body'} tone={emphasis ? 'default' : 'secondary'}>
      {label}
    </Text>
    <Text
      style={[typography.numeric, { fontSize: emphasis ? 18 : 15, color: tone ?? colors.text }]}
    >
      {value}
    </Text>
  </View>
);

const MetaRow = ({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) => (
  <View style={styles.metaRow}>
    <Ionicons name={icon} size={16} color={colors.textMuted} />
    <Text variant="body" tone="secondary" style={styles.metaLabel}>
      {label}
    </Text>
    <Text variant="bodyMedium" numberOfLines={1}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  content: { padding: spacing.base, paddingBottom: spacing.xl },
  summaryCard: { alignItems: 'center', paddingVertical: spacing.lg },
  total: { fontSize: 34, lineHeight: 42, color: colors.primaryDark, marginVertical: spacing.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },

  section: { marginTop: spacing.base },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: { marginBottom: spacing.sm },

  lineItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  qtyBadge: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: { fontSize: 14, color: colors.textSecondary },
  lineBody: { flex: 1, marginHorizontal: spacing.md },
  lineTotal: { fontSize: 15, color: colors.text },

  totalsDivider: { marginVertical: spacing.md },
  summaryLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },

  paymentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  paymentIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentBody: { flex: 1, marginHorizontal: spacing.md },
  paymentAmount: { fontSize: 15, color: colors.text },

  metaRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  metaLabel: { flex: 1, marginLeft: spacing.md },
  notes: { paddingVertical: spacing.md },
  notesText: { marginTop: spacing.xs },

  ledgerNote: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.lg },
  ledgerNoteText: { flex: 1, marginLeft: spacing.sm },
});
