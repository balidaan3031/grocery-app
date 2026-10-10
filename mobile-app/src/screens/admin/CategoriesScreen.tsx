import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  AppHeader,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  ListSkeleton,
  Screen,
  SegmentedControl,
  Sheet,
  Text,
  TextField,
} from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { categoriesApi } from '../../services/api';
import { useAuthStore, selectIsAdmin } from '../../store/authStore';
import { toast } from '../../store/uiStore';
import { colors, radius, spacing } from '../../theme';
import { AppError, fieldErrorsOf, messageOf } from '../../utils/errors';
import { pluralise } from '../../utils/format';
import type { Category } from '../../types';

type IconName = keyof typeof Ionicons.glyphMap;
type Visibility = 'active' | 'inactive';

/** Accent colours that stay legible as text and as a tinted background. */
const SWATCHES = [
  '#22C55E',
  '#10B981',
  '#06B6D4',
  '#38BDF8',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#EF4444',
  '#F97316',
  '#F59E0B',
  '#84CC16',
  '#64748B',
];

const ICONS: IconName[] = [
  'basket-outline',
  'nutrition-outline',
  'leaf-outline',
  'egg-outline',
  'pizza-outline',
  'fast-food-outline',
  'cafe-outline',
  'wine-outline',
  'beer-outline',
  'water-outline',
  'ice-cream-outline',
  'fish-outline',
  'snow-outline',
  'home-outline',
  'sparkles-outline',
  'medkit-outline',
  'paw-outline',
  'gift-outline',
  'cube-outline',
  'pricetag-outline',
];

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

interface FormState {
  name: string;
  description: string;
  color: string;
  icon: string;
  visibility: Visibility;
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  color: SWATCHES[0]!,
  icon: 'basket-outline',
  visibility: 'active',
};

/** `#abc` → `#aabbcc`, so an alpha suffix can be appended to any stored colour. */
const expandHex = (hex: string): string =>
  /^#[0-9a-f]{3}$/i.test(hex) ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex;

const tint = (hex: string): string => `${expandHex(hex)}1F`;

const sameColour = (a: string, b: string): boolean =>
  expandHex(a).toLowerCase() === expandHex(b).toLowerCase();

/**
 * Category management, for admins.
 *
 * Deleting is refused by the API while active products still use a category,
 * so "Inactive" is the everyday way to retire one: it disappears from filters
 * and the product form while its products stay on sale.
 */
export const CategoriesScreen = () => {
  const isAdmin = useAuthStore(selectIsAdmin);

  const fetchCategories = useCallback(
    () => categoriesApi.list({ includeInactive: true, withCounts: true }),
    [],
  );
  const { data, isLoading, isRefreshing, error, reload, refresh } = useAsync(fetchCategories, {
    immediate: isAdmin,
  });

  // Active first, then alphabetical (the API already sorts by name).
  const categories = useMemo(
    () => [...(data ?? [])].sort((a, b) => Number(b.is_active) - Number(a.is_active)),
    [data],
  );

  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: '' }));
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setIsOpen(true);
  };

  const openEdit = (category: Category) => {
    setEditing(category);
    setForm({
      name: category.name,
      description: category.description ?? '',
      color: category.color,
      icon: category.icon,
      visibility: category.is_active ? 'active' : 'inactive',
    });
    setErrors({});
    setIsOpen(true);
  };

  const close = () => {
    if (!isSaving) setIsOpen(false);
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) {
      setErrors({ name: 'Give the category a name' });
      return;
    }

    setIsSaving(true);

    const payload = {
      name,
      description: form.description.trim() || null,
      color: form.color,
      icon: form.icon,
    };

    try {
      if (editing) {
        await categoriesApi.update(editing.id, {
          ...payload,
          isActive: form.visibility === 'active',
        });
        toast.success('Category updated', name);
      } else {
        await categoriesApi.create(payload);
        toast.success('Category added', name);
      }

      setIsOpen(false);
      await refresh();
    } catch (caught) {
      const fieldErrors = fieldErrorsOf(caught);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
      } else if (caught instanceof AppError && caught.code === 'CONFLICT') {
        // Names are unique case-insensitively; that is the only conflict here.
        setErrors({ name: caught.message });
      } else {
        toast.error(editing ? 'Could not save changes' : 'Could not add the category', messageOf(caught));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!editing) return;
    const category = editing;

    Alert.alert(
      `Delete ${category.name}?`,
      'This cannot be undone. It is only allowed once no active products use the category — otherwise set it to Inactive instead.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsSaving(true);
            try {
              await categoriesApi.remove(category.id);
              setIsOpen(false);
              toast.success('Category deleted', category.name);
              await refresh();
            } catch (caught) {
              toast.error('Could not delete', messageOf(caught));
            } finally {
              setIsSaving(false);
            }
          },
        },
      ],
    );
  };

  if (!isAdmin) {
    return (
      <Screen edges={['top', 'bottom']}>
        <AppHeader title="Categories" showBack />
        <EmptyState
          icon="lock-closed-outline"
          title="Admins only"
          message="Ask a store admin to change the catalogue's categories."
        />
      </Screen>
    );
  }

  // A category created elsewhere may use a colour or icon outside the presets;
  // keep it selectable so opening the form never silently changes it.
  const swatches = SWATCHES.some((swatch) => sameColour(swatch, form.color))
    ? SWATCHES
    : [form.color, ...SWATCHES];
  const icons = ICONS.includes(form.icon as IconName) ? ICONS : [form.icon as IconName, ...ICONS];

  const renderItem = ({ item }: { item: Category }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.name}${item.is_active ? '' : ', inactive'}`}
      onPress={() => openEdit(item)}
      style={({ pressed }) => [styles.row, !item.is_active && styles.rowInactive, pressed && styles.rowPressed]}
    >
      <View style={[styles.rowIcon, { backgroundColor: tint(item.color) }]}>
        <Ionicons name={item.icon as IconName} size={20} color={item.color} />
      </View>

      <View style={styles.rowBody}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {item.name}
        </Text>
        <Text variant="small" tone="muted" numberOfLines={1}>
          {pluralise(item.productCount ?? 0, 'active product')}
          {item.description ? ` · ${item.description}` : ''}
        </Text>
      </View>

      {item.is_active ? null : <Badge label="Inactive" tone="neutral" size="sm" style={styles.rowBadge} />}
      <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
    </Pressable>
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <AppHeader
        title="Categories"
        subtitle={data ? pluralise(categories.length, 'category', 'categories') : undefined}
        showBack
        right={<IconButton icon="add" label="Add a category" tone="primary" size={38} onPress={openCreate} />}
      />

      {isLoading && !data ? (
        <ListSkeleton count={6} />
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, categories.length === 0 && styles.listEmpty]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            error ? (
              <ErrorState message={error} onRetry={reload} />
            ) : (
              <EmptyState
                icon="grid-outline"
                title="No categories yet"
                message="Categories group the catalogue into aisles and drive the product filters."
                action={{ label: 'Add a category', icon: 'add', onPress: openCreate }}
              />
            )
          }
          refreshing={isRefreshing}
          onRefresh={refresh}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Sheet
        visible={isOpen}
        onClose={close}
        title={editing ? 'Edit category' : 'New category'}
        subtitle={
          editing ? pluralise(editing.productCount ?? 0, 'active product') : 'Groups products into an aisle'
        }
        footer={
          <View style={styles.sheetFooter}>
            <Button label="Cancel" variant="secondary" disabled={isSaving} onPress={close} style={styles.sheetButton} />
            <Button
              label={editing ? 'Save' : 'Add category'}
              loading={isSaving}
              onPress={handleSave}
              style={styles.sheetButton}
            />
          </View>
        }
      >
        {/* Live preview, in the chip style the product filters use */}
        <View style={styles.preview}>
          <View style={[styles.previewChip, { backgroundColor: form.color }]}>
            <Ionicons name={form.icon as IconName} size={14} color={colors.textInverse} />
            <Text variant="smallMedium" tone="inverse" numberOfLines={1}>
              {form.name.trim() || 'Category name'}
            </Text>
          </View>
        </View>

        <TextField
          label="Name"
          required
          value={form.name}
          onChangeText={(value) => setField('name', value)}
          error={errors.name}
          placeholder="Frozen foods"
          icon="pricetags-outline"
          maxLength={80}
          containerStyle={styles.field}
        />

        <TextField
          label="Description"
          value={form.description}
          onChangeText={(value) => setField('description', value)}
          error={errors.description}
          placeholder="Optional"
          icon="document-text-outline"
          maxLength={500}
          containerStyle={styles.field}
        />

        <Text variant="smallMedium" tone="secondary" style={styles.label}>
          Colour
        </Text>
        <View style={styles.swatches}>
          {swatches.map((swatch) => {
            const isActive = sameColour(swatch, form.color);
            return (
              <Pressable
                key={swatch}
                accessibilityRole="radio"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`Colour ${swatch}`}
                onPress={() => setField('color', swatch)}
                style={[styles.swatch, { backgroundColor: swatch }, isActive && styles.swatchActive]}
              >
                {isActive ? <Ionicons name="checkmark" size={16} color={colors.textInverse} /> : null}
              </Pressable>
            );
          })}
        </View>

        <Text variant="smallMedium" tone="secondary" style={styles.label}>
          Icon
        </Text>
        <View style={styles.icons}>
          {icons.map((icon) => {
            const isActive = icon === form.icon;
            return (
              <Pressable
                key={icon}
                accessibilityRole="radio"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={icon.replace(/-outline$/, '').replace(/-/g, ' ')}
                onPress={() => setField('icon', icon)}
                style={[
                  styles.iconOption,
                  isActive && { backgroundColor: tint(form.color), borderColor: form.color },
                ]}
              >
                <Ionicons name={icon} size={20} color={isActive ? form.color : colors.textSecondary} />
              </Pressable>
            );
          })}
        </View>

        {editing ? (
          <>
            <Text variant="smallMedium" tone="secondary" style={styles.label}>
              Status
            </Text>
            <SegmentedControl
              options={VISIBILITY_OPTIONS}
              value={form.visibility}
              onChange={(value) => setField('visibility', value)}
            />
            <Text variant="small" tone="muted" style={styles.hint}>
              Inactive categories are hidden from filters and the product form. Their products stay on
              sale.
            </Text>

            <Button
              label="Delete category"
              icon="trash-outline"
              variant="ghost"
              disabled={isSaving}
              onPress={handleDelete}
              style={styles.delete}
            />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
};

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.base, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  listEmpty: { flexGrow: 1 },
  separator: { height: spacing.sm },

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
  rowInactive: { backgroundColor: colors.surfaceAlt },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, marginHorizontal: spacing.md },
  rowBadge: { marginRight: spacing.sm },

  preview: { alignItems: 'center', marginBottom: spacing.lg },
  previewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: '80%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },

  field: { marginBottom: spacing.base },
  label: { marginBottom: spacing.sm },
  hint: { marginTop: spacing.sm },

  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchActive: { borderWidth: 2, borderColor: colors.text },

  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  delete: { marginTop: spacing.lg },

  sheetFooter: { flexDirection: 'row', gap: spacing.sm },
  sheetButton: { flex: 1 },
});
