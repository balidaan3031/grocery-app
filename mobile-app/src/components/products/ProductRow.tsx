import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProductImage } from './ProductImage';
import { Text } from '../ui/Text';
import { StockBadge } from '../ui/Badge';
import { PressableScale } from '../ui/PressableScale';
import { colors, radius, spacing, typography } from '../../theme';
import { formatBarcode, formatCurrency } from '../../utils/format';
import type { Product } from '../../types';

interface ProductRowProps {
  product: Product;
  onPress: () => void;
  /** Quick-add affordance; hidden where adding to a cart makes no sense. */
  onAdd?: () => void;
  /** Shows the barcode instead of the category — useful right after a scan. */
  showBarcode?: boolean;
  disabled?: boolean;
}

/**
 * The standard product line, shared by the catalogue, search results and
 * inventory. One component means a product looks the same everywhere, and a
 * change to how stock is surfaced lands in all three at once.
 *
 * Memoised because these render inside long FlatLists that re-render on every
 * search keystroke.
 */
export const ProductRow = memo(
  ({ product, onPress, onAdd, showBarcode = false, disabled = false }: ProductRowProps) => {
    const isOutOfStock = product.stock_status === 'out_of_stock';

    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${product.name}, ${formatCurrency(product.selling_price)}`}
        onPress={onPress}
        disabled={disabled}
        scaleTo={0.985}
        style={[styles.row, disabled && styles.disabled]}
      >
        <ProductImage
          uri={product.image_url}
          name={product.name}
          accent={product.category_color}
          icon={product.category_icon}
          size={54}
        />

        <View style={styles.body}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {product.name}
          </Text>

          <Text variant="small" tone="muted" numberOfLines={1} style={styles.meta}>
            {showBarcode
              ? formatBarcode(product.barcode)
              : (product.category_name ?? 'Uncategorised')}
            {' · '}
            {product.sku}
          </Text>

          <View style={styles.footer}>
            <Text style={[typography.numeric, styles.price]}>
              {formatCurrency(product.selling_price)}
            </Text>
            <StockBadge
              status={product.stock_status}
              quantity={product.quantity}
              unit={product.unit}
              size="sm"
            />
          </View>
        </View>

        {onAdd ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`Add ${product.name} to cart`}
            onPress={onAdd}
            disabled={isOutOfStock}
            scaleTo={0.88}
            style={[styles.add, isOutOfStock && styles.addDisabled]}
          >
            <Ionicons
              name={isOutOfStock ? 'close' : 'add'}
              size={20}
              color={isOutOfStock ? colors.textMuted : colors.textOnPrimary}
            />
          </PressableScale>
        ) : (
          <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
        )}
      </PressableScale>
    );
  },
);

ProductRow.displayName = 'ProductRow';

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
  disabled: { opacity: 0.55 },
  body: { flex: 1, marginLeft: spacing.md },
  meta: { marginTop: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.sm },
  price: { fontSize: 15, color: colors.text },
  add: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  addDisabled: { backgroundColor: colors.surfaceAlt },
});
