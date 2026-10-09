import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { PressableScale } from '../ui/PressableScale';
import { ProductImage } from '../products/ProductImage';
import { colors, radius, shadows, spacing, typography } from '../../theme';
import { formatBarcode, formatCurrency } from '../../utils/format';
import type { ScanOutcome } from '../../store/cartStore';

interface ScanResultCardProps {
  outcome: ScanOutcome;
  isAdding: boolean;
  /** Only admins may add or restore products; staff are told who can. */
  canManageCatalogue: boolean;
  onCreateProduct: (barcode: string) => void;
  onOpenProduct: (productId: string) => void;
}

/**
 * The feedback panel under the viewfinder.
 *
 * Every scan lands in one of four states and each gets a distinct colour, icon
 * and next step — a cashier scanning at speed reads the colour first and the
 * words only if something is wrong.
 *
 * The card slides up rather than appearing, which keeps the viewfinder above it
 * visually stable between scans.
 */
export const ScanResultCard = ({
  outcome,
  isAdding,
  canManageCatalogue,
  onCreateProduct,
  onOpenProduct,
}: ScanResultCardProps) => {
  const enter = useRef(new Animated.Value(0)).current;

  // Re-animate on each new outcome so a repeat scan of the same product still
  // reads as a fresh event rather than a static card.
  const signature =
    outcome.status === 'added'
      ? `${outcome.product.id}-${outcome.quantityInCart}`
      : outcome.status === 'idle'
        ? 'idle'
        : `${outcome.status}-${outcome.barcode}`;

  useEffect(() => {
    enter.setValue(0);
    Animated.spring(enter, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 7 }).start();
  }, [signature, enter]);

  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  const animatedStyle = { opacity: enter, transform: [{ translateY }] };

  if (isAdding) {
    return (
      <Animated.View style={[styles.card, styles.busyCard, animatedStyle]}>
        <ActivityIndicator color={colors.primary} />
        <Text variant="bodyMedium" style={styles.busyText}>
          Looking up product…
        </Text>
      </Animated.View>
    );
  }

  if (outcome.status === 'idle') {
    return (
      <Animated.View style={[styles.card, styles.hintCard, animatedStyle]}>
        <Ionicons name="barcode-outline" size={20} color={colors.textMuted} />
        <Text variant="small" tone="secondary" style={styles.hintText}>
          Point the camera at a barcode. Items are added to the cart automatically.
        </Text>
      </Animated.View>
    );
  }

  if (outcome.status === 'added') {
    const { product, quantityInCart, wasAlreadyInCart } = outcome;

    return (
      <Animated.View style={animatedStyle}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`${product.name} added. Open product details.`}
          onPress={() => onOpenProduct(product.id)}
          scaleTo={0.985}
          style={[styles.card, styles.successCard]}
        >
          <View style={styles.row}>
            <ProductImage
              uri={product.image_url}
              name={product.name}
              accent={product.category_color}
              icon={product.category_icon}
              size={52}
            />

            <View style={styles.body}>
              <View style={styles.statusRow}>
                <Ionicons
                  name={wasAlreadyInCart ? 'add-circle' : 'checkmark-circle'}
                  size={15}
                  color={colors.success}
                />
                <Text variant="caption" tone="success" style={styles.statusText}>
                  {wasAlreadyInCart ? 'QUANTITY UPDATED' : 'ADDED TO CART'}
                </Text>
              </View>

              <Text variant="bodyMedium" numberOfLines={1}>
                {product.name}
              </Text>

              <View style={styles.priceRow}>
                <Text style={[typography.numeric, styles.price]}>
                  {formatCurrency(product.selling_price)}
                </Text>
                <Text variant="small" tone="muted">
                  {product.quantity} {product.unit} in stock
                </Text>
              </View>
            </View>

            <View style={styles.qtyPill}>
              <Text style={[typography.numeric, styles.qtyValue]}>×{quantityInCart}</Text>
            </View>
          </View>

          {/* Low stock is worth surfacing at the till, while the shelf is nearby */}
          {product.stock_status === 'low_stock' ? (
            <View style={styles.note}>
              <Ionicons name="alert-circle-outline" size={13} color={colors.onWarningSoft} />
              <Text variant="caption" tone="warning" style={styles.noteText}>
                Only {product.quantity} {product.unit} left — worth restocking.
              </Text>
            </View>
          ) : null}
        </PressableScale>
      </Animated.View>
    );
  }

  if (outcome.status === 'not_found') {
    return (
      <Animated.View style={[styles.card, styles.warningCard, animatedStyle]}>
        <View style={styles.row}>
          <View style={[styles.iconWrap, { backgroundColor: colors.warningSoft }]}>
            <Ionicons name="help-circle-outline" size={24} color={colors.warning} />
          </View>

          <View style={styles.body}>
            <Text variant="bodyMedium">Unknown barcode</Text>
            <Text variant="small" tone="secondary" numberOfLines={2}>
              {formatBarcode(outcome.barcode)} is not in the catalogue.
              {canManageCatalogue ? '' : ' Ask an admin to add it.'}
            </Text>
          </View>
        </View>

        {canManageCatalogue ? (
          <Button
            label="Add this product"
            icon="add"
            size="sm"
            fullWidth
            onPress={() => onCreateProduct(outcome.barcode)}
            style={styles.action}
          />
        ) : null}
      </Animated.View>
    );
  }

  if (outcome.status === 'inactive') {
    return (
      <Animated.View style={[styles.card, styles.warningCard, animatedStyle]}>
        <View style={styles.row}>
          <View style={[styles.iconWrap, { backgroundColor: colors.warningSoft }]}>
            <Ionicons name="pause-circle-outline" size={24} color={colors.warning} />
          </View>

          <View style={styles.body}>
            <Text variant="bodyMedium" numberOfLines={1}>
              {outcome.productName}
            </Text>
            <Text variant="small" tone="secondary" numberOfLines={2}>
              This product is deactivated and cannot be sold.
              {canManageCatalogue ? '' : ' Ask an admin to restore it.'}
            </Text>
          </View>
        </View>

        {canManageCatalogue ? (
          <Button
            label="View product to restore it"
            icon="open-outline"
            size="sm"
            variant="secondary"
            fullWidth
            onPress={() => onOpenProduct(outcome.productId)}
            style={styles.action}
          />
        ) : null}
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.card, styles.errorCard, animatedStyle]}>
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: colors.dangerSoft }]}>
          <Ionicons name="close-circle-outline" size={24} color={colors.danger} />
        </View>

        <View style={styles.body}>
          <Text variant="bodyMedium">Could not add item</Text>
          <Text variant="small" tone="secondary" numberOfLines={2}>
            {outcome.message}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.lg,
  },
  busyCard: { flexDirection: 'row', alignItems: 'center' },
  busyText: { marginLeft: spacing.md },
  hintCard: { flexDirection: 'row', alignItems: 'center' },
  hintText: { flex: 1, marginLeft: spacing.md },
  successCard: { borderColor: colors.palette.green200, borderLeftWidth: 4, borderLeftColor: colors.success },
  warningCard: { borderColor: colors.palette.amber100, borderLeftWidth: 4, borderLeftColor: colors.warning },
  errorCard: { borderColor: colors.palette.red100, borderLeftWidth: 4, borderLeftColor: colors.danger },
  row: { flexDirection: 'row', alignItems: 'center' },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, marginLeft: spacing.md },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  statusText: { marginLeft: spacing.xs, letterSpacing: 0.6 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  price: { fontSize: 15, color: colors.text },
  qtyPill: {
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  qtyValue: { fontSize: 15, color: colors.onPrimarySoft },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  noteText: { marginLeft: spacing.xs, flex: 1 },
  action: { marginTop: spacing.md },
});
