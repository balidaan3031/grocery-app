import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  AppHeader,
  ChipRow,
  EmptyState,
  ErrorState,
  IconButton,
  ListSkeleton,
  LoadingState,
  Screen,
  SearchField,
  SegmentedControl,
  Text,
  type ChipOption,
} from '../../components/ui';
import { ProductRow } from '../../components/products/ProductRow';
import { useAsync } from '../../hooks/useAsync';
import { useDebounce } from '../../hooks/useDebounce';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { inventoryApi } from '../../services/api';
import { colors, radius, spacing, typography } from '../../theme';
import { formatCompactCurrency, formatNumber, pluralise } from '../../utils/format';
import type { Product, StockStatus } from '../../types';
import type { RootStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

const STOCK_FILTERS: ChipOption<StockStatus>[] = [
  { value: 'out_of_stock', label: 'Out of stock', icon: 'close-circle-outline' },
  { value: 'low_stock', label: 'Low stock', icon: 'alert-circle-outline' },
  { value: 'in_stock', label: 'Healthy', icon: 'checkmark-circle-outline' },
];

type SortKey = 'quantity' | 'name' | 'updated_at';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'quantity', label: 'Lowest first' },
  { value: 'name', label: 'A–Z' },
  { value: 'updated_at', label: 'Recent' },
];

export const InventoryScreen = () => {
  const navigation = useNavigation<Navigation>();

  const [search, setSearch] = useState('');
  const [stockStatus, setStockStatus] = useState<StockStatus | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('quantity');

  const debouncedSearch = useDebounce(search, 350);

  const fetchSummary = useCallback(() => inventoryApi.summary(), []);
  // Stock changes on almost every other screen, so both the summary and the
  // list are stale on return.
  const { data: summary, refresh: refreshSummary } = useAsync(fetchSummary, { refetchOnFocus: true });

  const fetchPage = useCallback(
    (page: number) =>
      inventoryApi.list({
        page,
        limit: 20,
        search: debouncedSearch.trim() || undefined,
        stockStatus: stockStatus ?? undefined,
        sortBy,
        // "Lowest first" is the restocking view; the other sorts read better
        // in their conventional direction.
        sortOrder: sortBy === 'quantity' ? 'asc' : sortBy === 'name' ? 'asc' : 'desc',
      }),
    [debouncedSearch, stockStatus, sortBy],
  );

  const { items, meta, isLoading, isRefreshing, isLoadingMore, error, reload, refresh, loadMore } =
    usePaginatedList<Product>(fetchPage, { refetchOnFocus: true });

  const handleRefresh = () => {
    void refresh();
    void refreshSummary();
  };

  return (
    <Screen edges={['top']}>
      <AppHeader
        title="Inventory"
        subtitle={meta ? pluralise(meta.total, 'product') : undefined}
        right={
          <IconButton
            icon="time-outline"
            label="Stock movement history"
            size={38}
            onPress={() => navigation.navigate('MovementHistory')}
          />
        }
      />

      {/* Health summary — three numbers that decide what to do next */}
      {summary ? (
        <View style={styles.summary}>
          <SummaryCell
            value={formatNumber(summary.outOfStock)}
            label="Out"
            tone={colors.danger}
            active={stockStatus === 'out_of_stock'}
            onPress={() =>
              setStockStatus(stockStatus === 'out_of_stock' ? null : 'out_of_stock')
            }
          />
          <SummaryCell
            value={formatNumber(summary.lowStock)}
            label="Low"
            tone={colors.warning}
            active={stockStatus === 'low_stock'}
            onPress={() => setStockStatus(stockStatus === 'low_stock' ? null : 'low_stock')}
          />
          <SummaryCell
            value={formatNumber(summary.inStock)}
            label="Healthy"
            tone={colors.success}
            active={stockStatus === 'in_stock'}
            onPress={() => setStockStatus(stockStatus === 'in_stock' ? null : 'in_stock')}
          />
          <SummaryCell
            value={formatCompactCurrency(summary.retailValue)}
            label="Value"
            tone={colors.accent}
          />
        </View>
      ) : null}

      <View style={styles.controls}>
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search stock by name, SKU or barcode"
          onScanPress={() => navigation.navigate('Tabs', { screen: 'Scanner' })}
        />
      </View>

      <ChipRow options={STOCK_FILTERS} value={stockStatus} onChange={setStockStatus} />

      <View style={styles.sortWrap}>
        <SegmentedControl options={SORT_OPTIONS} value={sortBy} onChange={setSortBy} />
      </View>

      {isLoading && items.length === 0 ? (
        <ListSkeleton count={6} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ProductRow
              product={item}
              onPress={() => navigation.navigate('StockAdjust', { productId: item.id })}
            />
          )}
          contentContainerStyle={[styles.list, items.length === 0 && styles.listEmpty]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            error ? (
              <ErrorState message={error} onRetry={reload} />
            ) : (
              <EmptyState
                icon="layers-outline"
                title={stockStatus || search ? 'Nothing matches' : 'No stock to show'}
                message={
                  stockStatus === 'out_of_stock'
                    ? 'Nothing is out of stock right now.'
                    : stockStatus === 'low_stock'
                      ? 'No products are below their low-stock threshold.'
                      : 'Add products to start tracking stock levels.'
                }
                action={
                  stockStatus || search
                    ? {
                        label: 'Clear filters',
                        onPress: () => {
                          setSearch('');
                          setStockStatus(null);
                        },
                      }
                    : undefined
                }
              />
            )
          }
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews
          ListFooterComponent={isLoadingMore ? <LoadingState compact /> : null}
        />
      )}
    </Screen>
  );
};

/**
 * A tappable health counter. Tapping toggles the matching stock filter, which
 * makes the summary the fastest route into the restocking worklist.
 */
const SummaryCell = ({
  value,
  label,
  tone,
  active,
  onPress,
}: {
  value: string;
  label: string;
  tone: string;
  active?: boolean;
  onPress?: () => void;
}) => {
  const body = (
    <>
      <View style={[styles.summaryDot, { backgroundColor: tone }]} />
      <Text style={[typography.numeric, styles.summaryValue]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </>
  );

  if (!onPress) {
    return <View style={[styles.summaryCell, active && { borderColor: tone }]}>{body}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(active) }}
      accessibilityLabel={`${value} ${label}. Tap to filter.`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.summaryCell,
        active && { borderColor: tone },
        pressed && styles.summaryCellPressed,
      ]}
    >
      {body}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
  },
  summaryCell: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  summaryCellPressed: { backgroundColor: colors.surfaceAlt },
  summaryDot: { width: 7, height: 7, borderRadius: 4, marginBottom: spacing.xs },
  summaryValue: { fontSize: 17, color: colors.text },
  controls: { paddingHorizontal: spacing.base, paddingBottom: spacing.sm },
  sortWrap: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing.xxl },
  listEmpty: { flexGrow: 1 },
  separator: { height: spacing.sm },
});
