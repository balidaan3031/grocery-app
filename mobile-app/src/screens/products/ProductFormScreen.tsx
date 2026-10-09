import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import {
  AppHeader,
  Button,
  Card,
  LoadingState,
  Screen,
  Text,
  TextField,
} from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { categoriesApi, productsApi } from '../../services/api';
import { hasSupabaseStorage, uploadProductImage } from '../../services/imageUpload';
import { toast } from '../../store/uiStore';
import { colors, radius, spacing } from '../../theme';
import { fieldErrorsOf, inactiveProductOf, messageOf } from '../../utils/errors';
import { barcodeProblem, cleanBarcode } from '../../utils/barcode';
import { formatCurrency } from '../../utils/format';
import type { RootScreenProps, RootStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

interface FormState {
  name: string;
  description: string;
  barcode: string;
  sku: string;
  categoryId: string | null;
  purchasePrice: string;
  sellingPrice: string;
  taxRate: string;
  unit: string;
  lowStockThreshold: string;
  initialQuantity: string;
  imageUrl: string | null;
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  barcode: '',
  sku: '',
  categoryId: null,
  purchasePrice: '',
  sellingPrice: '',
  taxRate: '0',
  unit: 'pcs',
  lowStockThreshold: '10',
  initialQuantity: '0',
  imageUrl: null,
};

const UNITS = ['pcs', 'kg', 'g', 'litre', 'ml', 'pack', 'box', 'bottle', 'tray', 'loaf', 'bag'];

/** Derives a starting SKU from the name so the field is rarely typed by hand. */
const suggestSku = (name: string): string => {
  const words = name.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const stem = words
    .slice(0, 2)
    .map((word) => word.replace(/[^A-Z0-9]/g, '').slice(0, 4))
    .filter(Boolean)
    .join('-');
  return stem ? `${stem}-${String(Date.now()).slice(-4)}` : '';
};

export const ProductFormScreen = ({ route }: RootScreenProps<'ProductForm'>) => {
  const navigation = useNavigation<Navigation>();
  const { productId, barcode: scannedBarcode } = route.params ?? {};
  const isEditing = Boolean(productId);

  const [form, setForm] = useState<FormState>({
    ...EMPTY_FORM,
    // Pre-filled straight from the scanner's "unknown barcode" path, so the
    // number never has to be retyped from the packet.
    barcode: scannedBarcode ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [localImage, setLocalImage] = useState<string | null>(null);

  const fetchCategories = useCallback(() => categoriesApi.list(), []);
  const { data: categories } = useAsync(fetchCategories);

  const fetchProduct = useCallback(
    () => (productId ? productsApi.byId(productId) : Promise.resolve(null)),
    [productId],
  );
  const { data: product, isLoading } = useAsync(fetchProduct, { immediate: Boolean(productId) });

  useEffect(() => {
    if (!product) return;
    setForm({
      name: product.name,
      description: product.description ?? '',
      barcode: product.barcode,
      sku: product.sku,
      categoryId: product.category_id,
      purchasePrice: String(product.purchase_price),
      sellingPrice: String(product.selling_price),
      taxRate: String(product.tax_rate),
      unit: product.unit,
      lowStockThreshold: String(product.low_stock_threshold),
      initialQuantity: '0',
      imageUrl: product.image_url,
    });
  }, [product]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key as string]) {
      setErrors((current) => ({ ...current, [key as string]: '' }));
    }
  };

  /**
   * A code read by BarcodeCapture. Filled in, then checked against the
   * catalogue straight away, so a barcode another product owns is flagged
   * while the packet is still in hand rather than on save. Not found or a
   * network failure stay silent: the save checks again.
   */
  const capturedBarcode = route.params?.capturedBarcode;
  const capturedAt = route.params?.capturedAt;
  useEffect(() => {
    if (!capturedBarcode || !capturedAt) return;
    setForm((current) => ({ ...current, barcode: capturedBarcode }));
    setErrors((current) => ({ ...current, barcode: '' }));

    let cancelled = false;
    productsApi
      .byBarcode(capturedBarcode)
      .then((owner) => {
        if (!cancelled && owner.id !== productId) {
          setErrors((current) => ({ ...current, barcode: `Already used by ${owner.name}` }));
        }
      })
      .catch((caught) => {
        const inactive = inactiveProductOf(caught);
        if (!cancelled && inactive && inactive.productId !== productId) {
          setErrors((current) => ({
            ...current,
            barcode: `Already used by ${inactive.productName}, which is deactivated — restore it instead`,
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [capturedBarcode, capturedAt, productId]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};

    if (!form.name.trim()) next.name = 'Give the product a name';
    const barcodeError = barcodeProblem(form.barcode);
    if (barcodeError) next.barcode = barcodeError === 'Enter a barcode' ? 'A barcode is required' : barcodeError;
    if (!form.sku.trim()) next.sku = 'An SKU is required';

    const selling = Number(form.sellingPrice);
    if (!form.sellingPrice.trim()) next.sellingPrice = 'Set a selling price';
    else if (!Number.isFinite(selling) || selling < 0) next.sellingPrice = 'Enter a valid amount';

    const purchase = Number(form.purchasePrice || '0');
    if (form.purchasePrice.trim() && (!Number.isFinite(purchase) || purchase < 0)) {
      next.purchasePrice = 'Enter a valid amount';
    }

    const tax = Number(form.taxRate || '0');
    if (!Number.isFinite(tax) || tax < 0 || tax > 100) next.taxRate = 'Tax must be between 0 and 100';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const pickImage = async () => {
    if (!hasSupabaseStorage) {
      toast.warning(
        'Image upload not configured',
        'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to enable it.',
      );
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.error('Photo access denied', 'Allow photo access to attach a product image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      // Product thumbnails are shown at most ~180pt, so a full-resolution
      // upload would cost the store bandwidth for pixels nobody sees.
      quality: 0.7,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setLocalImage(asset.uri);
    setIsUploading(true);

    try {
      const url = await uploadProductImage(asset.uri, form.name || form.sku || 'product');
      setField('imageUrl', url);
      toast.success('Image uploaded');
    } catch (caught) {
      setLocalImage(null);
      toast.error('Upload failed', messageOf(caught));
    } finally {
      setIsUploading(false);
    }
  };

  /** Set synchronously: a double tap must not create the product twice. */
  const saving = useRef(false);

  const handleSave = async () => {
    if (saving.current || !validate()) return;

    saving.current = true;
    setIsSaving(true);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      barcode: cleanBarcode(form.barcode),
      sku: form.sku.trim(),
      categoryId: form.categoryId,
      purchasePrice: Number(form.purchasePrice || '0'),
      sellingPrice: Number(form.sellingPrice),
      taxRate: Number(form.taxRate || '0'),
      unit: form.unit,
      imageUrl: form.imageUrl,
      lowStockThreshold: Number(form.lowStockThreshold || '0'),
      // Selling below cost is blocked server-side unless confirmed. The form
      // already shows the margin, so the choice here is deliberate.
      allowBelowCost: true,
    };

    try {
      if (isEditing && productId) {
        await productsApi.update(productId, payload);
        toast.success('Product updated', payload.name);
        navigation.goBack();
      } else {
        const created = await productsApi.create({
          ...payload,
          initialQuantity: Number(form.initialQuantity || '0'),
        });
        toast.success('Product added', created.name);
        navigation.replace('ProductDetail', { productId: created.id });
      }
    } catch (caught) {
      const fieldErrors = fieldErrorsOf(caught);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
        toast.error('Check the highlighted fields');
      } else {
        toast.error(isEditing ? 'Could not save changes' : 'Could not add product', messageOf(caught));
      }
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };

  if (isLoading && isEditing) {
    return (
      <Screen edges={['top']}>
        <AppHeader title="Edit product" showBack />
        <LoadingState />
      </Screen>
    );
  }

  const margin = Number(form.sellingPrice || '0') - Number(form.purchasePrice || '0');
  const showMargin = Boolean(form.sellingPrice && form.purchasePrice);
  const previewImage = localImage ?? form.imageUrl;

  return (
    <Screen edges={['top']} avoidKeyboard>
      <AppHeader
        title={isEditing ? 'Edit product' : 'New product'}
        subtitle={isEditing ? product?.name : scannedBarcode ? 'From a scanned barcode' : undefined}
        showBack
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Image first: it is the fastest way to confirm you are editing the
            right product when several look alike on the shelf */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a product image"
          onPress={pickImage}
          disabled={isUploading}
          style={styles.imagePicker}
        >
          {previewImage ? (
            <Image source={{ uri: previewImage }} style={styles.image} contentFit="cover" />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="camera-outline" size={26} color={colors.primary} />
              <Text variant="small" tone="primary" style={styles.imageLabel}>
                Add photo
              </Text>
            </View>
          )}

          {isUploading ? (
            <View style={styles.imageOverlay}>
              <Text variant="caption" tone="inverse">
                Uploading…
              </Text>
            </View>
          ) : null}
        </Pressable>

        <Text variant="h3" style={styles.sectionTitle}>
          Basics
        </Text>

        <TextField
          label="Product name"
          required
          value={form.name}
          onChangeText={(value) => {
            setField('name', value);
            // Only auto-fill the SKU while creating and while it is untouched.
            if (!isEditing && !form.sku) setField('sku', suggestSku(value));
          }}
          onBlur={() => {
            if (!isEditing && !form.sku.trim() && form.name.trim()) {
              setField('sku', suggestSku(form.name));
            }
          }}
          error={errors.name}
          placeholder="Amul Toned Milk 1L"
          icon="cube-outline"
          containerStyle={styles.field}
        />

        <TextField
          label="Barcode"
          required
          value={form.barcode}
          onChangeText={(value) => setField('barcode', value)}
          error={errors.barcode}
          placeholder="8901030100000"
          icon="barcode-outline"
          // Letters allowed: own-label Code 128 tags are not all digits.
          autoCapitalize="characters"
          autoCorrect={false}
          hint="Must be unique — this is what the scanner matches on."
          action={{
            icon: 'scan-outline',
            label: 'Scan a barcode',
            onPress: () => navigation.navigate('BarcodeCapture', { returnKey: route.key }),
          }}
          containerStyle={styles.field}
        />

        <TextField
          label="SKU"
          required
          value={form.sku}
          onChangeText={(value) => setField('sku', value.toUpperCase())}
          error={errors.sku}
          placeholder="DRY-MLK-1L"
          icon="pricetag-outline"
          autoCapitalize="characters"
          containerStyle={styles.field}
        />

        <TextField
          label="Description"
          value={form.description}
          onChangeText={(value) => setField('description', value)}
          placeholder="Optional — shown on the product screen"
          icon="document-text-outline"
          multiline
          numberOfLines={3}
          containerStyle={styles.field}
        />

        <Text variant="smallMedium" tone="secondary" style={styles.groupLabel}>
          Category
        </Text>
        <View style={styles.categoryGrid}>
          {(categories ?? []).map((category) => {
            const isActive = category.id === form.categoryId;
            return (
              <Pressable
                key={category.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: isActive }}
                onPress={() => setField('categoryId', isActive ? null : category.id)}
                style={[
                  styles.categoryChip,
                  isActive && { backgroundColor: category.color, borderColor: category.color },
                ]}
              >
                <Ionicons
                  name={(category.icon as never) ?? 'basket-outline'}
                  size={14}
                  color={isActive ? colors.textInverse : colors.textSecondary}
                />
                <Text
                  variant="smallMedium"
                  style={{ color: isActive ? colors.textInverse : colors.textSecondary }}
                >
                  {category.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text variant="h3" style={styles.sectionTitle}>
          Pricing
        </Text>

        <View style={styles.row}>
          <TextField
            label="Cost price"
            value={form.purchasePrice}
            onChangeText={(value) => setField('purchasePrice', value)}
            error={errors.purchasePrice}
            placeholder="0.00"
            keyboardType="decimal-pad"
            containerStyle={styles.half}
          />
          <TextField
            label="Selling price"
            required
            value={form.sellingPrice}
            onChangeText={(value) => setField('sellingPrice', value)}
            error={errors.sellingPrice}
            placeholder="0.00"
            keyboardType="decimal-pad"
            containerStyle={styles.half}
          />
        </View>

        {showMargin ? (
          <Card variant={margin >= 0 ? 'tinted' : 'flat'} padding="md" style={styles.marginCard}>
            <Ionicons
              name={margin >= 0 ? 'trending-up' : 'trending-down'}
              size={16}
              color={margin >= 0 ? colors.success : colors.danger}
            />
            <Text variant="small" tone={margin >= 0 ? 'success' : 'danger'} style={styles.marginText}>
              {margin >= 0
                ? `Margin of ${formatCurrency(margin)} per ${form.unit}`
                : `Selling ${formatCurrency(Math.abs(margin))} below cost`}
            </Text>
          </Card>
        ) : null}

        <View style={styles.row}>
          <TextField
            label="Tax rate"
            value={form.taxRate}
            onChangeText={(value) => setField('taxRate', value)}
            error={errors.taxRate}
            placeholder="0"
            keyboardType="decimal-pad"
            suffix="%"
            containerStyle={styles.half}
          />
          <TextField
            label="Low stock alert"
            value={form.lowStockThreshold}
            onChangeText={(value) => setField('lowStockThreshold', value)}
            placeholder="10"
            keyboardType="number-pad"
            suffix={form.unit}
            containerStyle={styles.half}
          />
        </View>

        <Text variant="smallMedium" tone="secondary" style={styles.groupLabel}>
          Sold by
        </Text>
        <View style={styles.categoryGrid}>
          {UNITS.map((unit) => {
            const isActive = unit === form.unit;
            return (
              <Pressable
                key={unit}
                accessibilityRole="radio"
                accessibilityState={{ selected: isActive }}
                onPress={() => setField('unit', unit)}
                style={[styles.unitChip, isActive && styles.unitChipActive]}
              >
                <Text variant="smallMedium" tone={isActive ? 'inverse' : 'secondary'}>
                  {unit}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {!isEditing ? (
          <>
            <Text variant="h3" style={styles.sectionTitle}>
              Opening stock
            </Text>
            <TextField
              label="Quantity on hand"
              value={form.initialQuantity}
              onChangeText={(value) => setField('initialQuantity', value)}
              placeholder="0"
              keyboardType="number-pad"
              suffix={form.unit}
              icon="layers-outline"
              hint="Recorded as a restock in the stock ledger."
              containerStyle={styles.field}
            />
          </>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={isEditing ? 'Save changes' : 'Add product'}
          icon="checkmark"
          size="lg"
          fullWidth
          loading={isSaving}
          disabled={isUploading}
          onPress={handleSave}
        />
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  content: { padding: spacing.base, paddingBottom: spacing.xl },
  imagePicker: { alignSelf: 'center', marginBottom: spacing.lg },
  image: { width: 120, height: 120, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt },
  imagePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primarySoftBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageLabel: { marginTop: spacing.xs },
  imageOverlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.lg,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { marginTop: spacing.lg, marginBottom: spacing.sm },
  groupLabel: { marginTop: spacing.base, marginBottom: spacing.sm },
  field: { marginBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1, marginBottom: spacing.md },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  unitChip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  unitChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  marginCard: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  marginText: { marginLeft: spacing.sm, flex: 1 },
  footer: {
    padding: spacing.base,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
