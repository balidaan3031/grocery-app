import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
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
  Text,
  type ChipOption,
} from '../../components/ui';
import { ProductRow } from '../../components/products/ProductRow';
import { useDebounce } from '../../hooks/useDebounce';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { useAsync } from '../../hooks/useAsync';
import { categoriesApi, productsApi } from '../../services/api';
import { useAuthStore, selectIsAdmin } from '../../store/authStore';
import { useCartStore, selectCartCount } from '../../store/cartStore';
import { toast } from '../../store/uiStore';
import { colors, radius, spacing } from '../../theme';
import { messageOf, stockDetailsOf } from '../../utils/errors';
import { pluralise } from '../../utils/format';
import type { Product, StockStatus } from '../../types';
import type { RootStackParamList, TabParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

const STOCK_FILTERS: ChipOption<StockStatus>[] = [
  { value: 'low_stock', label: 'Low stock', icon: 'alert-circle-outline' },
  { value: 'out_of_stock', label: 'Out of stock', icon: 'close-circle-outline' },
  { value: 'in_stock', label: 'In stock', icon: 'checkmark-circle-outline' },
];

export const ProductListScreen = () => {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<RouteProp<TabParamList, 'Products'>>();
  const isAdmin = useAuthStore(selectIsAdmin);
  const cartCount = useCartStore(selectCartCount);
  const addProduct = useCartStore((state) => state.addProduct);

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [stockStatus, setStockStatus] = useState<StockStatus | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  /** The admin's archive of deactivated products — the only route back to one. */
  const inactiveView = isAdmin && showInactive;

  // Profile → "Deactivated products" arrives here with the flag set. Each
  // navigation carries a fresh params object, so a repeat visit re-applies it.
  useEffect(() => {
    if (route.params?.showInactive) setShowInactive(true);
  }, [route.params]);

  const debouncedSearch = useDebounce(search, 350);

  const fetchCategories = useCallback(() => categoriesApi.list({ withCounts: true }), []);
  const { data: categories } = useAsync(fetchCategories, { refetchOnFocus: true });

  // A category retired elsewhere drops out of the chips; a filter on it would
  // then be invisible and impossible to clear.
  useEffect(() => {
    if (categoryId && categories && !categories.some((category) => category.id === categoryId)) {
      setCategoryId(null);
    }
  }, [categories, categoryId]);

  /**
   * Memoised on the filter values, and nothing else.
   *
   * `usePaginatedList` resets to page one whenever this identity changes, so an
   * unstable closure here would refetch the catalogue on every keystroke and
   * every render — the debounced term is what should drive it.
   */
  const fetchPage = useCallback(
    (page: number) =>
      productsApi.list({
        page,
        limit: 20,
        search: debouncedSearch.trim() || undefined,
        categoryId: categoryId ?? undefined,
        stockStatus: stockStatus ?? undefined,
        isActive: inactiveView ? false : undefined,
        sortBy: 'name',
        sortOrder: 'asc',
      }),
    [debouncedSearch, categoryId, stockStatus, inactiveView],
  );

  // Prices, stock and new products all change elsewhere; refresh on return.
  const { items, meta, isLoading, isRefreshing, isLoadingMore, error, reload, refresh, loadMore } =
    usePaginatedList<Product>(fetchPage, { refetchOnFocus: true });

  const categoryOptions = useMemo<ChipOption<string>[]>(
    () =>
      (categories ?? []).map((category) => ({
        value: category.id,
        label: category.name,
        // The counts are of active products; beside an archive they would mislead.
        count: inactiveView ? undefined : category.productCount,
        color: category.color,
      })),
    [categories, inactiveView],
  );

  const handleQuickAdd = async (product: Product) => {
    try {
      await addProduct(product.id, 1);
      toast.success('Added to cart', product.name);
    } catch (caught) {
      const stock = stockDetailsOf(caught);
      toast.error(
        'Could not add',
        stock ? `Only ${stock.available} ${product.unit} of ${product.name} left.` : messageOf(caught),
      );
    }
  };

  const hasFilters = Boolean(debouncedSearch.trim() || categoryId || stockStatus);

  const clearFilters = () => {
    setSearch('');
    setCategoryId(null);
    setStockStatus(null);
  };

  const renderEmpty = () => {
    if (isLoading) return null;

    if (error) return <ErrorState message={error} onRetry={reload} />;

    if (inactiveView && !hasFilters) {
      return (
        <EmptyState
          icon="archive-outline"
          title="No deactivated products"
          message="Products you deactivate appear here, so they can be reactivated later."
          action={{ label: 'Show active products', onPress: () => setShowInactive(false) }}
        />
      );
    }

    if (hasFilters) {
      return (
        <EmptyState
          icon="search-outline"
          title="No matching products"
          message="Try a different search term, or clear the filters to see everything."
          action={{ label: 'Clear filters', onPress: clearFilters }}
          secondaryAction={
            isAdmin && !inactiveView
              ? {
                  label: 'Add a new product',
                  onPress: () =>
                    navigation.navigate('ProductForm', {
                      barcode: /^\d{6,}$/.test(search.trim()) ? search.trim() : undefined,
                    }),
                }
              : undefined
          }
        />
      );
    }

    return (
      <EmptyState
        icon="pricetags-outline"
        title="No products yet"
        message={
          isAdmin
            ? 'Add your first product to start scanning and selling.'
            : 'Ask your store admin to add products to the catalogue.'
        }
        action={
          isAdmin
            ? { label: 'Add product', icon: 'add', onPress: () => navigation.navigate('ProductForm', {}) }
            : undefined
        }
      />
    );
  };

  return (
    <Screen edges={['top']}>
      <AppHeader
        title="Products"
        subtitle={
          meta ? pluralise(meta.total, inactiveView ? 'deactivated product' : 'product') : undefined
        }
        right={
          <View style={styles.headerActions}>
            <IconButton
              icon="cart-outline"
              label={`Open cart, ${cartCount} items`}
              badge={cartCount}
              size={38}
              onPress={() => navigation.navigate('Cart')}
            />
            {isAdmin ? (
              <IconButton
                icon={inactiveView ? 'archive' : 'archive-outline'}
                label={inactiveView ? 'Show active products' : 'Show deactivated products'}
                tone={inactiveView ? 'primary' : 'surface'}
                size={38}
                onPress={() => setShowInactive((current) => !current)}
              />
            ) : null}
            {isAdmin ? (
              <IconButton
                icon="add"
                label="Add product"
                tone="primary"
                size={38}
                onPress={() => navigation.navigate('ProductForm', {})}
              />
            ) : null}
          </View>
        }
      />

      {inactiveView ? (
        <View style={styles.archiveBanner}>
          <Ionicons name="archive-outline" size={16} color={colors.onWarningSoft} />
          <Text variant="small" tone="warning" style={styles.archiveText}>
            Deactivated products cannot be scanned or sold. Open one to reactivate it.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowInactive(false)}
            hitSlop={8}
          >
            <Text variant="smallMedium" tone="primary">
              Done
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.searchWrap}>
        <SearchField
          value={search}
          onChangeText={setSearch}
          onScanPress={() => navigation.navigate('Tabs', { screen: 'Scanner' })}
        />
      </View>

      {categoryOptions.length > 0 ? (
        <ChipRow options={categoryOptions} value={categoryId} onChange={setCategoryId} />
      ) : null}

      <ChipRow options={STOCK_FILTERS} value={stockStatus} onChange={setStockStatus} />

      {isLoading && items.length === 0 ? (
        <ListSkeleton count={7} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ProductRow
              product={item}
              showBarcode={/^\d{6,}$/.test(debouncedSearch.trim())}
              onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
              onAdd={inactiveView ? undefined : () => void handleQuickAdd(item)}
            />
          )}
          contentContainerStyle={[styles.list, items.length === 0 && styles.listEmpty]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={renderEmpty()}
          refreshing={isRefreshing}
          onRefresh={refresh}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // Detaches off-screen rows from the native view tree, which keeps
          // scrolling smooth on a catalogue of a few hundred products.
          removeClippedSubviews
          ListFooterComponent={
            isLoadingMore ? (
              <LoadingState compact />
            ) : meta && !meta.hasMore && items.length > 8 ? (
              <Text variant="caption" tone="muted" center style={styles.endOfList}>
                {pluralise(meta.total, 'product')} · end of list
              </Text>
            ) : null
          }
        />
      )}
    </Screen>
  );
};

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  archiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  archiveText: { flex: 1 },
  searchWrap: { paddingHorizontal: spacing.base, paddingBottom: spacing.sm },
  list: { paddingHorizontal: spacing.base, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  listEmpty: { flexGrow: 1 },
  separator: { height: spacing.sm },
  endOfList: { paddingVertical: spacing.lg },
});
