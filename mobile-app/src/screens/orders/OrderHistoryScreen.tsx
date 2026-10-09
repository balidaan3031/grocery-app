import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  AppHeader,
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  ListSkeleton,
  LoadingState,
  Screen,
  SearchField,
  Text,
  type ChipOption,
} from '../../components/ui';
import { OrderRow } from '../../components/orders/OrderRow';
import { useDebounce } from '../../hooks/useDebounce';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { ordersApi } from '../../services/api';
import { useAuthStore, selectIsAdmin } from '../../store/authStore';
import { colors, spacing, typography } from '../../theme';
import { formatCompactCurrency, formatDate, pluralise } from '../../utils/format';
import type { OrderSummary, PaymentMethod } from '../../types';
import type { RootStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/**
 * One chip row drives two different filters. `mine` is not a payment method, so
 * it gets its own value in the union rather than being smuggled through the
 * PaymentMethod type.
 */
type OrderFilter = PaymentMethod | 'mine';

const PAYMENT_FILTERS: ChipOption<OrderFilter>[] = [
  { value: 'cash', label: 'Cash', icon: 'cash-outline' },
  { value: 'card', label: 'Card', icon: 'card-outline' },
  { value: 'upi', label: 'UPI', icon: 'phone-portrait-outline' },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal-circle-outline' },
];

const MINE_FILTER: ChipOption<OrderFilter> = {
  value: 'mine',
  label: 'My sales',
  icon: 'person-outline',
};

export const OrderHistoryScreen = () => {
  const navigation = useNavigation<Navigation>();
  const isAdmin = useAuthStore(selectIsAdmin);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<OrderFilter | null>(null);

  const onlyMine = filter === 'mine';
  const paymentMethod = filter && filter !== 'mine' ? filter : null;

  const debouncedSearch = useDebounce(search, 350);

  const fetchPage = useCallback(
    (page: number) =>
      ordersApi.list({
        page,
        limit: 20,
        search: debouncedSearch.trim() || undefined,
        paymentMethod: paymentMethod ?? undefined,
        // Staff are already scoped server-side; the toggle only means something
        // for an admin looking at the whole store.
        mine: isAdmin && onlyMine ? 'true' : undefined,
      }),
    [debouncedSearch, paymentMethod, onlyMine, isAdmin],
  );

  const { items, meta, isLoading, isRefreshing, isLoadingMore, error, reload, refresh, loadMore } =
    usePaginatedList<OrderSummary>(fetchPage);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  /** Takings for the orders currently loaded — a running read of the shift. */
  const loadedTotal = useMemo(
    () => items.reduce((sum, order) => sum + Number(order.total_amount), 0),
    [items],
  );

  return (
    <Screen edges={['top']}>
      <AppHeader
        title="Orders"
        subtitle={meta ? pluralise(meta.total, 'order') : undefined}
      />

      <View style={styles.controls}>
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search by order number or customer"
        />
      </View>

      <ChipRow
        options={isAdmin ? [...PAYMENT_FILTERS, MINE_FILTER] : PAYMENT_FILTERS}
        value={filter}
        onChange={setFilter}
      />

      {items.length > 0 ? (
        <Card variant="flat" padding="md" style={styles.totalCard}>
          <View>
            <Text variant="caption" tone="muted">
              SHOWING
            </Text>
            <Text variant="smallMedium">{pluralise(items.length, 'order')}</Text>
          </View>

          <View style={styles.totalRight}>
            <Text variant="caption" tone="muted">
              TOTAL
            </Text>
            <Text style={[typography.numeric, styles.totalValue]}>
              {formatCompactCurrency(loadedTotal)}
            </Text>
          </View>
        </Card>
      ) : null}

      {isLoading && items.length === 0 ? (
        <ListSkeleton count={7} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => {
            const previous = index > 0 ? items[index - 1] : undefined;
            const showDate =
              !previous ||
              new Date(previous.created_at).toDateString() !==
                new Date(item.created_at).toDateString();

            return (
              <>
                {showDate ? (
                  <Text variant="overline" tone="muted" style={styles.dateHeading}>
                    {formatDate(item.created_at)}
                  </Text>
                ) : null}
                <OrderRow
                  order={item}
                  onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
                />
              </>
            );
          }}
          contentContainerStyle={[styles.list, items.length === 0 && styles.listEmpty]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            error ? (
              <ErrorState message={error} onRetry={reload} />
            ) : (
              <EmptyState
                icon="receipt-outline"
                title={search || filter ? 'No matching orders' : 'No sales yet'}
                message={
                  search || filter
                    ? 'Try a different search or clear the filter.'
                    : 'Completed sales appear here with their full itemised receipt.'
                }
                action={
                  search || filter
                    ? {
                        label: 'Clear filters',
                        onPress: () => {
                          setSearch('');
                          setFilter(null);
                        },
                      }
                    : {
                        label: 'Start a sale',
                        icon: 'scan',
                        onPress: () => navigation.navigate('Tabs', { screen: 'Scanner' }),
                      }
                }
              />
            )
          }
          refreshing={isRefreshing}
          onRefresh={refresh}
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

const styles = StyleSheet.create({
  controls: { paddingHorizontal: spacing.base, paddingBottom: spacing.sm },
  totalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.base,
    marginTop: spacing.sm,
  },
  totalRight: { alignItems: 'flex-end' },
  totalValue: { fontSize: 17, color: colors.text },
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing.xxl },
  listEmpty: { flexGrow: 1 },
  separator: { height: spacing.sm },
  dateHeading: { marginTop: spacing.base, marginBottom: spacing.sm },
});
