import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import {
  AppHeader,
  Button,
  Card,
  Divider,
  ErrorState,
  LoadingState,
  Screen,
  SectionHeader,
  StockBadge,
  Text,
  TextField,
} from '../../components/ui';
import { MovementRow } from '../../components/inventory/MovementRow';
import { ProductImage } from '../../components/products/ProductImage';
import { useAsync } from '../../hooks/useAsync';
import { inventoryApi, productsApi } from '../../services/api';
import { toast } from '../../store/uiStore';
import { colors, radius, spacing, typography } from '../../theme';
import { formatCurrency, formatDelta } from '../../utils/format';
import { messageOf, stockDetailsOf } from '../../utils/errors';
import { createId } from '../../utils/id';
import type { MovementType } from '../../types';
import type { RootScreenProps, RootStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type AdjustType = Exclude<MovementType, 'sale'>;
/**
 * `count` is a stocktake: the user enters what is on the shelf and the server
 * works out the change. Doing that subtraction here would use the quantity this
 * screen loaded, and every sale made since then would be counted twice.
 */
type Direction = 'add' | 'remove' | 'count';

/** The API's ceiling for a single change; see the inventory validator. */
const MAX_QUANTITY = 1_000_000;

/**
 * Movement types offered for a manual change.
 *
 * `sale` is absent deliberately: sales are only ever written by checkout, so
 * offering it here would let stock leave without an order behind it and break
 * the reconciliation between the ledger and the till.
 */
const REASONS: Record<
  Exclude<Direction, 'count'>,
  { type: AdjustType; label: string; icon: keyof typeof Ionicons.glyphMap; hint: string }[]
> = {
  add: [
    { type: 'purchase', label: 'Restock', icon: 'arrow-down-circle-outline', hint: 'Delivery from a supplier' },
    { type: 'return', label: 'Return', icon: 'arrow-undo-outline', hint: 'Customer brought it back' },
    { type: 'adjustment', label: 'Correction', icon: 'create-outline', hint: 'Fix a known mistake' },
  ],
  remove: [
    { type: 'damage', label: 'Damaged', icon: 'alert-circle-outline', hint: 'Expired, broken, spoiled' },
    { type: 'adjustment', label: 'Correction', icon: 'create-outline', hint: 'Fix a known mistake' },
  ],
};

const QUICK_AMOUNTS = [1, 5, 10, 25, 50];

/** Digits only, no leading zeros — so the field shows exactly what will be sent. */
const toDigits = (text: string): string => text.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 7);

export const StockAdjustScreen = ({ route }: RootScreenProps<'StockAdjust'>) => {
  const navigation = useNavigation<Navigation>();
  // Footers sit on the bottom edge, under the home indicator or nav bar.
  const insets = useSafeAreaInsets();
  const { productId } = route.params;

  const [direction, setDirection] = useState<Direction>('add');
  const [type, setType] = useState<AdjustType>('purchase');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  /** Set synchronously, so a double tap cannot slip in before the re-render. */
  const submitting = useRef(false);

  /**
   * The idempotency key for the change on screen. It survives a failed attempt,
   * so tapping again after a timeout replays the same request instead of
   * applying it twice, and is replaced as soon as the change itself differs.
   */
  const pendingKey = useRef<{ signature: string; key: string } | null>(null);

  const fetchProduct = useCallback(() => productsApi.byId(productId), [productId]);
  const fetchMovements = useCallback(() => inventoryApi.productMovements(productId), [productId]);

  const { data: product, isLoading, error, reload, refresh } = useAsync(fetchProduct);
  const { data: movements, refresh: refreshMovements } = useAsync(fetchMovements);

  const isCount = direction === 'count';
  const entered = amount === '' ? null : Number(amount);
  const tooLarge = entered !== null && entered > MAX_QUANTITY;

  const current = product?.quantity ?? 0;
  const delta = isCount ? (entered ?? current) - current : (direction === 'add' ? 1 : -1) * (entered ?? 0);
  const projected = isCount ? entered ?? current : current + delta;
  const wouldGoNegative = !isCount && projected < 0;
  const hasEntry = isCount ? entered !== null : (entered ?? 0) > 0;
  const canSubmit = Boolean(product) && hasEntry && !tooLarge && !wouldGoNegative;

  const switchDirection = (next: Direction) => {
    setDirection(next);
    // Reset to the first reason valid for the new direction, so an "add"
    // reason can never be attached to a removal. A count is always an adjustment.
    setType(next === 'count' ? 'adjustment' : REASONS[next][0]!.type);
  };

  const keyFor = (signature: string): string => {
    if (pendingKey.current?.signature !== signature) {
      pendingKey.current = { signature, key: createId() };
    }
    return pendingKey.current.key;
  };

  const handleSubmit = async () => {
    if (!product || !canSubmit || submitting.current) return;

    submitting.current = true;
    setIsSaving(true);

    const note = reason.trim() || null;
    const idempotencyKey = keyFor([product.id, direction, type, amount, note ?? ''].join('|'));

    try {
      // The confirmation quotes the server's before/after, not this screen's:
      // stock may have moved since it loaded.
      if (isCount) {
        const result = await inventoryApi.count(product.id, {
          countedQuantity: entered ?? 0,
          reason: note,
          idempotencyKey,
        });
        if (result.changed) {
          toast.success(
            'Stock counted',
            `${product.name}: ${result.previousQuantity} → ${result.newQuantity} ${product.unit}`,
          );
        } else {
          toast.success('Count matches', `${product.name}: ${result.newQuantity} ${product.unit}, nothing to correct`);
        }
      } else {
        const movement = await inventoryApi.adjust(product.id, {
          quantityChange: delta,
          type,
          reason: note,
          idempotencyKey,
        });
        toast.success(
          'Stock updated',
          `${product.name}: ${movement.previous_quantity} → ${movement.new_quantity} ${product.unit}`,
        );
      }

      pendingKey.current = null;
      setAmount('');
      setReason('');
      await Promise.all([refresh(), refreshMovements()]);
    } catch (caught) {
      const stock = stockDetailsOf(caught);
      if (stock) {
        // Sales happened while this screen was open; show the real figure.
        toast.error('Not enough stock', `Only ${stock.available} ${product.unit} on hand now.`);
        void refresh();
      } else {
        toast.error('Could not update stock', messageOf(caught));
      }
    } finally {
      submitting.current = false;
      setIsSaving(false);
    }
  };

  if (isLoading && !product) {
    return (
      <Screen edges={['top']}>
        <AppHeader title="Adjust stock" showBack />
        <LoadingState />
      </Screen>
    );
  }

  if (error && !product) {
    return (
      <Screen edges={['top']}>
        <AppHeader title="Adjust stock" showBack />
        <ErrorState message={error} onRetry={reload} />
      </Screen>
    );
  }

  if (!product) return null;

  return (
    <Screen edges={['top']} avoidKeyboard>
      <AppHeader title="Adjust stock" subtitle={product.name} showBack />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Card variant="outlined" style={styles.productCard}>
          <ProductImage
            uri={product.image_url}
            name={product.name}
            accent={product.category_color}
            icon={product.category_icon}
            size={52}
          />

          <View style={styles.productBody}>
            <Text variant="bodyMedium" numberOfLines={1}>
              {product.name}
            </Text>
            <Text variant="small" tone="muted">
              {product.sku} · {formatCurrency(product.selling_price)}
            </Text>
          </View>

          <View style={styles.currentStock}>
            <Text style={[typography.numeric, styles.currentValue]}>{current}</Text>
            <Text variant="caption" tone="muted">
              {product.unit}
            </Text>
          </View>
        </Card>

        {/* Direction first: adding, removing and counting are different
            intents, and picking one narrows what follows */}
        <View style={styles.directions}>
          <DirectionButton
            label="Add stock"
            icon="add-circle"
            tone={colors.success}
            active={direction === 'add'}
            onPress={() => switchDirection('add')}
          />
          <DirectionButton
            label="Remove stock"
            icon="remove-circle"
            tone={colors.danger}
            active={direction === 'remove'}
            onPress={() => switchDirection('remove')}
          />
          <DirectionButton
            label="Recount"
            icon="clipboard"
            tone={colors.primary}
            active={isCount}
            onPress={() => switchDirection('count')}
          />
        </View>

        <Text variant="smallMedium" tone="secondary" style={styles.groupLabel}>
          {isCount ? 'Counted on the shelf' : 'Quantity'}
        </Text>

        <TextField
          value={amount}
          onChangeText={(text) => setAmount(toDigits(text))}
          placeholder="0"
          keyboardType="number-pad"
          suffix={product.unit}
          icon={isCount ? 'clipboard-outline' : direction === 'add' ? 'add-outline' : 'remove-outline'}
          error={
            tooLarge
              ? `At most ${MAX_QUANTITY.toLocaleString()} at a time`
              : wouldGoNegative
                ? `Only ${current} ${product.unit} available to remove`
                : undefined
          }
          hint={isCount ? 'Everything on the shelf. The difference is worked out when you save.' : undefined}
          containerStyle={styles.field}
        />

        <View style={styles.quickRow}>
          {QUICK_AMOUNTS.map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={`Set quantity to ${value}`}
              onPress={() => setAmount(String(value))}
              style={({ pressed }) => [
                styles.quickChip,
                amount === String(value) && styles.quickChipActive,
                pressed && styles.quickChipPressed,
              ]}
            >
              <Text
                variant="smallMedium"
                tone={amount === String(value) ? 'inverse' : 'secondary'}
              >
                {value}
              </Text>
            </Pressable>
          ))}
        </View>

        {isCount ? null : (
          <Text variant="smallMedium" tone="secondary" style={styles.groupLabel}>
            Reason
          </Text>
        )}

        <View style={styles.reasons}>
          {(isCount ? [] : REASONS[direction]).map((option) => {
            const isActive = option.type === type;
            return (
              <Pressable
                key={`${direction}-${option.type}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: isActive }}
                onPress={() => setType(option.type)}
                style={[styles.reason, isActive && styles.reasonActive]}
              >
                <Ionicons
                  name={option.icon}
                  size={18}
                  color={isActive ? colors.primary : colors.textMuted}
                />
                <View style={styles.reasonText}>
                  <Text variant="bodyMedium" tone={isActive ? 'primary' : 'default'}>
                    {option.label}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {option.hint}
                  </Text>
                </View>
                {isActive ? (
                  <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <TextField
          label="Note"
          value={reason}
          onChangeText={setReason}
          placeholder={
            isCount ? 'e.g. Monthly stocktake, aisle 4' : 'e.g. Delivery from Sharma Traders, invoice 4821'
          }
          icon="document-text-outline"
          hint="Recorded in the stock ledger against this change."
          containerStyle={styles.field}
        />

        {/* Preview: shows what the ledger entry will say, based on the stock
            as loaded — the saved result quotes the server's figures */}
        {hasEntry && !tooLarge ? (
          <Card variant={wouldGoNegative ? 'flat' : 'tinted'} style={styles.preview}>
            <Text variant="caption" tone="muted">
              {isCount ? 'IF NOTHING SELLS BEFORE YOU SAVE' : 'AFTER THIS CHANGE'}
            </Text>

            <View style={styles.previewRow}>
              <PreviewValue label="Now" value={String(current)} />
              <Ionicons name="arrow-forward" size={17} color={colors.textMuted} />
              <PreviewValue
                label="Change"
                value={delta === 0 ? '0' : formatDelta(delta)}
                tone={delta > 0 ? colors.success : delta < 0 ? colors.danger : colors.textMuted}
              />
              <Ionicons name="arrow-forward" size={17} color={colors.textMuted} />
              <PreviewValue
                label="New total"
                value={String(Math.max(projected, 0))}
                tone={wouldGoNegative ? colors.danger : colors.primaryDark}
              />
            </View>

            {!wouldGoNegative && projected <= product.low_stock_threshold ? (
              <View style={styles.previewWarning}>
                <Ionicons name="alert-circle-outline" size={13} color={colors.onWarningSoft} />
                <Text variant="caption" tone="warning" style={styles.previewWarningText}>
                  Still at or below the low-stock threshold of {product.low_stock_threshold}.
                </Text>
              </View>
            ) : null}
          </Card>
        ) : null}

        <Divider style={styles.divider} />

        <SectionHeader
          title="Recent changes"
          action={{
            label: 'Full history',
            onPress: () => navigation.navigate('MovementHistory', { productId }),
          }}
        />

        {movements && movements.length > 0 ? (
          <View style={styles.movements}>
            {movements.slice(0, 4).map((movement) => (
              <MovementRow key={movement.id} movement={movement} showProduct={false} />
            ))}
          </View>
        ) : (
          <Text variant="small" tone="muted">
            No stock movements recorded for this product yet.
          </Text>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: spacing.base + insets.bottom }]}>
        <View style={styles.footerSummary}>
          <StockBadge status={product.stock_status} quantity={current} unit={product.unit} size="sm" />
          {canSubmit ? (
            <Text variant="small" tone="secondary">
              becomes {projected} {product.unit}
            </Text>
          ) : null}
        </View>

        <Button
          label={isCount ? 'Save count' : direction === 'add' ? 'Add to stock' : 'Remove from stock'}
          icon={
            isCount
              ? 'clipboard-outline'
              : direction === 'add'
                ? 'arrow-down-circle-outline'
                : 'arrow-up-circle-outline'
          }
          variant={direction === 'remove' ? 'danger' : 'primary'}
          size="lg"
          fullWidth
          loading={isSaving}
          disabled={!canSubmit || isSaving}
          onPress={handleSubmit}
        />
      </View>
    </Screen>
  );
};

const DirectionButton = ({
  label,
  icon,
  tone,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: string;
  active: boolean;
  onPress: () => void;
}) => (
  <Pressable
    accessibilityRole="radio"
    accessibilityState={{ selected: active }}
    onPress={onPress}
    style={[styles.direction, active && { borderColor: tone, backgroundColor: `${tone}12` }]}
  >
    <Ionicons name={icon} size={22} color={active ? tone : colors.textMuted} />
    <Text variant="bodyMedium" style={active ? { color: tone } : undefined}>
      {label}
    </Text>
  </Pressable>
);

const PreviewValue = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <View style={styles.previewValue}>
    <Text style={[typography.numeric, styles.previewNumber, tone ? { color: tone } : null]}>
      {value}
    </Text>
    <Text variant="caption" tone="muted">
      {label}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  content: { padding: spacing.base, paddingBottom: spacing.xl },
  productCard: { flexDirection: 'row', alignItems: 'center' },
  productBody: { flex: 1, marginHorizontal: spacing.md },
  currentStock: { alignItems: 'center' },
  currentValue: { fontSize: 22, color: colors.text },

  directions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  direction: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },

  groupLabel: { marginTop: spacing.lg, marginBottom: spacing.sm },
  field: { marginBottom: spacing.sm },
  quickRow: { flexDirection: 'row', gap: spacing.sm },
  quickChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  quickChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  quickChipPressed: { backgroundColor: colors.surfaceAlt },

  reasons: { gap: spacing.sm },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  reasonActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  reasonText: { flex: 1, marginLeft: spacing.md },

  preview: { marginTop: spacing.base, alignItems: 'center' },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  previewValue: { alignItems: 'center', minWidth: 60 },
  previewNumber: { fontSize: 20, color: colors.text },
  previewWarning: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  previewWarningText: { marginLeft: spacing.xs },

  divider: { marginVertical: spacing.lg },
  movements: { gap: spacing.sm },

  footer: {
    padding: spacing.base,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footerSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
});
