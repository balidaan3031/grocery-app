import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../ui/Text';
import { colors, radius, spacing, typography } from '../../theme';
import { MOVEMENT_LABELS, formatDelta, formatRelative } from '../../utils/format';
import type { InventoryMovement, MovementType } from '../../types';

const MOVEMENT_STYLE: Record<
  MovementType,
  { icon: keyof typeof Ionicons.glyphMap; bg: string; fg: string }
> = {
  purchase: { icon: 'arrow-down-circle-outline', bg: colors.successSoft, fg: colors.onSuccessSoft },
  sale: { icon: 'cart-outline', bg: colors.infoSoft, fg: colors.onInfoSoft },
  adjustment: { icon: 'create-outline', bg: colors.accentSoft, fg: colors.onAccentSoft },
  return: { icon: 'arrow-undo-outline', bg: colors.primarySoft, fg: colors.onPrimarySoft },
  damage: { icon: 'alert-circle-outline', bg: colors.dangerSoft, fg: colors.onDangerSoft },
};

interface MovementRowProps {
  movement: InventoryMovement;
  /** Off on a product's own history, where the name is already the heading. */
  showProduct?: boolean;
}

/**
 * One entry in the stock ledger.
 *
 * Deliberately spells out the whole story on a single line — previous → new,
 * the signed change, why, and who — because "traceable" only means something if
 * the trace is readable without opening anything.
 */
export const MovementRow = memo(({ movement, showProduct = true }: MovementRowProps) => {
  const style = MOVEMENT_STYLE[movement.type];
  const isIncrease = movement.quantity_change > 0;

  return (
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: style.bg }]}>
        <Ionicons name={style.icon} size={18} color={style.fg} />
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant="bodyMedium" numberOfLines={1} style={styles.title}>
            {showProduct ? movement.product_name : MOVEMENT_LABELS[movement.type]}
          </Text>

          <Text
            style={[
              typography.numeric,
              styles.delta,
              { color: isIncrease ? colors.success : colors.danger },
            ]}
          >
            {formatDelta(movement.quantity_change)}
          </Text>
        </View>

        <Text variant="small" tone="secondary" numberOfLines={1} style={styles.stockLine}>
          {movement.previous_quantity} → {movement.new_quantity} {movement.unit}
          {showProduct ? ` · ${MOVEMENT_LABELS[movement.type]}` : ''}
        </Text>

        <Text variant="caption" tone="muted" numberOfLines={1} style={styles.reason}>
          {movement.reason ?? 'No reason recorded'}
          {movement.created_by_name ? ` · ${movement.created_by_name}` : ''}
          {' · '}
          {formatRelative(movement.created_at)}
        </Text>
      </View>
    </View>
  );
});

MovementRow.displayName = 'MovementRow';

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, marginLeft: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flex: 1, marginRight: spacing.sm },
  delta: { fontSize: 15 },
  stockLine: { marginTop: 2 },
  reason: { marginTop: 3 },
});
