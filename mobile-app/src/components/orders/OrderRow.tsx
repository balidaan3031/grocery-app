import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../ui/Text';
import { Badge } from '../ui/Badge';
import { PressableScale } from '../ui/PressableScale';
import { colors, radius, spacing, typography } from '../../theme';
import { PAYMENT_LABELS, formatCurrency, formatRelative, pluralise } from '../../utils/format';
import type { OrderSummary, PaymentMethod } from '../../types';

const PAYMENT_ICONS: Record<PaymentMethod, keyof typeof Ionicons.glyphMap> = {
  cash: 'cash-outline',
  card: 'card-outline',
  upi: 'phone-portrait-outline',
  other: 'ellipsis-horizontal-circle-outline',
};

const STATUS_TONE = {
  completed: 'success',
  pending: 'warning',
  cancelled: 'neutral',
  refunded: 'info',
} as const;

export const OrderRow = memo(
  ({ order, onPress, compact = false }: { order: OrderSummary; onPress: () => void; compact?: boolean }) => (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.order_number}, ${formatCurrency(order.total_amount)}`}
      onPress={onPress}
      scaleTo={0.985}
      style={styles.row}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={PAYMENT_ICONS[order.payment_method]} size={19} color={colors.primary} />
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant="bodyMedium" numberOfLines={1} style={styles.number}>
            {order.order_number}
          </Text>
          <Text style={[typography.numeric, styles.total]}>
            {formatCurrency(order.total_amount)}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Text variant="small" tone="muted" numberOfLines={1} style={styles.meta}>
            {pluralise(order.item_count, 'item')} · {PAYMENT_LABELS[order.payment_method]} ·{' '}
            {formatRelative(order.created_at)}
          </Text>

          {!compact && order.status !== 'completed' ? (
            <Badge
              label={order.status[0]!.toUpperCase() + order.status.slice(1)}
              tone={STATUS_TONE[order.status]}
              size="sm"
            />
          ) : null}
        </View>
      </View>
    </PressableScale>
  ),
);

OrderRow.displayName = 'OrderRow';

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, marginLeft: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  number: { flex: 1, marginRight: spacing.sm },
  total: { fontSize: 15, color: colors.text },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 3,
    gap: spacing.sm,
  },
  meta: { flex: 1 },
});
