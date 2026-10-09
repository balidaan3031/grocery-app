import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  AppHeader,
  ChipRow,
  EmptyState,
  ErrorState,
  ListSkeleton,
  LoadingState,
  Screen,
  Text,
  type ChipOption,
} from '../../components/ui';
import { MovementRow } from '../../components/inventory/MovementRow';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { inventoryApi } from '../../services/api';
import { spacing } from '../../theme';
import { formatDate, pluralise } from '../../utils/format';
import type { InventoryMovement, MovementType } from '../../types';
import type { RootScreenProps } from '../../navigation/types';

const TYPE_FILTERS: ChipOption<MovementType>[] = [
  { value: 'sale', label: 'Sales', icon: 'cart-outline' },
  { value: 'purchase', label: 'Restocks', icon: 'arrow-down-circle-outline' },
  { value: 'adjustment', label: 'Adjustments', icon: 'create-outline' },
  { value: 'damage', label: 'Damaged', icon: 'alert-circle-outline' },
  { value: 'return', label: 'Returns', icon: 'arrow-undo-outline' },
];

/**
 * The complete stock ledger.
 *
 * Reached either globally (from Inventory) or scoped to one product, which is
 * why `productId` is optional — the same screen answers "what happened to this
 * product" and "what happened in the shop today".
 */
export const MovementHistoryScreen = ({ route }: RootScreenProps<'MovementHistory'>) => {
  const productId = route.params?.productId;
  const [type, setType] = useState<MovementType | null>(null);

  const fetchPage = useCallback(
    (page: number) =>
      inventoryApi.movements({
        page,
        limit: 25,
        productId,
        type: type ?? undefined,
      }),
    [productId, type],
  );

  const { items, meta, isLoading, isRefreshing, isLoadingMore, error, reload, refresh, loadMore } =
    usePaginatedList<InventoryMovement>(fetchPage);

  /**
   * Day separators.
   *
   * A flat list of timestamps is hard to scan; grouping by date is how someone
   * actually reads a ledger ("what happened on Tuesday"). Computed inline
   * against the previous row rather than restructuring the data, so pagination
   * keeps working unchanged.
   */
  const renderItem = ({ item, index }: { item: InventoryMovement; index: number }) => {
    const previous = index > 0 ? items[index - 1] : undefined;
    const showDate =
      !previous ||
      new Date(previous.created_at).toDateString() !== new Date(item.created_at).toDateString();

    return (
      <>
        {showDate ? (
          <Text variant="overline" tone="muted" style={styles.dateHeading}>
            {formatDate(item.created_at)}
          </Text>
        ) : null}
        <MovementRow movement={item} showProduct={!productId} />
      </>
    );
  };

  return (
    <Screen edges={['top']}>
      <AppHeader
        title="Stock history"
        subtitle={
          meta
            ? `${pluralise(meta.total, 'movement')}${productId ? ' for this product' : ''}`
            : undefined
        }
        showBack
      />

      <ChipRow options={TYPE_FILTERS} value={type} onChange={setType} />

      {isLoading && items.length === 0 ? (
        <ListSkeleton count={7} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, items.length === 0 && styles.listEmpty]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            error ? (
              <ErrorState message={error} onRetry={reload} />
            ) : (
              <EmptyState
                icon="time-outline"
                title={type ? 'No movements of this kind' : 'No stock movements yet'}
                message={
                  type
                    ? 'Try a different filter to see other kinds of stock change.'
                    : 'Every restock, sale and correction will appear here with its full before-and-after.'
                }
                action={type ? { label: 'Show all', onPress: () => setType(null) } : undefined}
              />
            )
          }
          refreshing={isRefreshing}
          onRefresh={refresh}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          ListFooterComponent={isLoadingMore ? <LoadingState compact /> : null}
        />
      )}
    </Screen>
  );
};

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing.xxl },
  listEmpty: { flexGrow: 1 },
  separator: { height: spacing.sm },
  dateHeading: { marginTop: spacing.base, marginBottom: spacing.sm },
});
