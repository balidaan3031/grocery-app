import { useCallback, useRef, useState } from 'react';
import { AppState, Dimensions, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Button, IconButton, Sheet, Text, TextField } from '../../components/ui';
import { ScanFrame } from '../../components/scanner/ScanFrame';
import { ScanResultCard } from '../../components/scanner/ScanResultCard';
import { useCartStore, selectCartCount, selectCartTotal } from '../../store/cartStore';
import { useAuthStore, selectIsAdmin } from '../../store/authStore';
import { useScanFeedback } from '../../hooks/useScanFeedback';
import { useScanGate } from '../../hooks/useScanGate';
import { colors, radius, shadows, spacing, typography } from '../../theme';
import { formatCurrency, pluralise } from '../../utils/format';
import { barcodeProblem, cleanBarcode } from '../../utils/barcode';
import type { RootStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/**
 * Formats a barcode camera actually reads in a grocery store. EAN-13 and UPC-A
 * cover packaged goods; the rest catch own-label shelf tags and case codes.
 * Narrowing the list measurably speeds up detection versus scanning for all.
 */
const BARCODE_TYPES = [
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'code128',
  'code39',
  'code93',
  'itf14',
  'codabar',
] as const;

const FRAME_SIZE = Math.min(Dimensions.get('window').width * 0.72, 290);

export const ScannerScreen = () => {
  const navigation = useNavigation<Navigation>();
  const [permission, requestPermission] = useCameraPermissions();
  const feedback = useScanFeedback();
  const gate = useScanGate();
  const isAdmin = useAuthStore(selectIsAdmin);

  const scanBarcode = useCartStore((state) => state.scanBarcode);
  const resetScan = useCartStore((state) => state.resetScan);
  const lastScan = useCartStore((state) => state.lastScan);
  const isAdding = useCartStore((state) => state.isAdding);
  const cartCount = useCartStore(selectCartCount);
  const cartTotal = useCartStore(selectCartTotal);

  const [torchOn, setTorchOn] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  /**
   * The camera is only mounted while this tab is focused and the app is in the
   * foreground. Leaving it running in the background keeps the sensor hot,
   * drains the battery through a shift, and shows a privacy indicator for a
   * screen nobody is looking at.
   */
  const [isActive, setIsActive] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setIsActive(true);
      resetScan();
      gate.reset();

      const subscription = AppState.addEventListener('change', (state) => {
        setIsActive(state === 'active');
      });

      return () => {
        setIsActive(false);
        setTorchOn(false);
        subscription.remove();
      };
    }, [resetScan, gate]),
  );

  /**
   * True while a lookup is in flight. A ref rather than state: detections
   * arrive faster than React re-renders, and the gate must see the change on
   * the very next frame.
   */
  const busy = useRef(false);

  const processBarcode = useCallback(
    async (code: string) => {
      if (busy.current || !code) return;
      busy.current = true;

      try {
        const outcome = await scanBarcode(code);
        if (!outcome) return; // not acted on: no buzz for something that did not happen

        if (outcome.status === 'added') {
          if (outcome.wasAlreadyInCart) feedback.bump();
          else feedback.success();
        } else if (outcome.status === 'not_found' || outcome.status === 'inactive') {
          feedback.notFound();
        } else if (outcome.status === 'error') {
          feedback.failure();
        }
      } finally {
        busy.current = false;
      }
    },
    [scanBarcode, feedback],
  );

  /**
   * Every detection goes through the gate — including those that arrive while
   * a lookup is in flight, so a product held in view stays "seen" and is not
   * added a second time when the lookup ends.
   */
  const handleBarcodeScanned = useCallback(
    ({ data, type }: BarcodeScanningResult) => {
      const code = cleanBarcode(data ?? '');
      if (!code || !gate.offer(code, type, busy.current)) return;
      void processBarcode(code);
    },
    [gate, processBarcode],
  );

  const handleManualChange = (value: string) => {
    setManualCode(value);
    if (manualError) setManualError(null);
  };

  const handleManualSubmit = async () => {
    const problem = barcodeProblem(manualCode);
    if (problem) {
      setManualError(problem);
      return;
    }
    const code = cleanBarcode(manualCode);
    setManualOpen(false);
    setManualCode('');
    await processBarcode(code);
  };

  const closeManual = () => {
    setManualOpen(false);
    setManualError(null);
  };

  const handleCreateProduct = (barcode: string) => {
    resetScan();
    navigation.navigate('ProductForm', { barcode });
  };

  // --- Permission gates ------------------------------------------------------

  if (!permission) {
    return <View style={styles.dark} />;
  }

  if (!permission.granted) {
    const permanentlyDenied = !permission.canAskAgain;

    return (
      <SafeAreaView style={styles.permissionScreen} edges={['top', 'bottom']}>
        <View style={styles.permissionContent}>
          <View style={styles.permissionIcon}>
            <Ionicons name="camera-outline" size={34} color={colors.primary} />
          </View>

          <Text variant="h2" center>
            Camera access needed
          </Text>
          <Text variant="body" tone="secondary" center style={styles.permissionText}>
            {permanentlyDenied
              ? 'Camera permission was declined. Enable it in Settings to scan barcodes straight into the cart.'
              : 'Allow camera access to scan product barcodes and add them to the cart instantly.'}
          </Text>

          <Button
            label={permanentlyDenied ? 'Open Settings' : 'Allow camera'}
            icon={permanentlyDenied ? 'settings-outline' : 'camera'}
            size="lg"
            fullWidth
            onPress={() => {
              if (permanentlyDenied) void Linking.openSettings();
              else void requestPermission();
            }}
            style={styles.permissionButton}
          />

          <Button
            label="Enter barcode manually"
            variant="ghost"
            icon="keypad-outline"
            onPress={() => setManualOpen(true)}
          />

          {/* Without a camera the result card is the only feedback a manual entry gets */}
          {lastScan.status !== 'idle' || isAdding ? (
            <View style={styles.permissionResult}>
              <ScanResultCard
                outcome={lastScan}
                isAdding={isAdding}
                canManageCatalogue={isAdmin}
                onCreateProduct={handleCreateProduct}
                onOpenProduct={(productId) => navigation.navigate('ProductDetail', { productId })}
              />
            </View>
          ) : null}
        </View>

        <ManualEntrySheet
          visible={manualOpen}
          value={manualCode}
          error={manualError}
          onChange={handleManualChange}
          onClose={closeManual}
          onSubmit={handleManualSubmit}
        />
      </SafeAreaView>
    );
  }

  // --- Scanner ---------------------------------------------------------------

  const frameTone =
    lastScan.status === 'added' ? 'success' : lastScan.status === 'idle' ? 'idle' : 'error';

  return (
    <View style={styles.dark}>
      {isActive ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torchOn}
          barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
          // Detection keeps running during a lookup; the guards above decide
          // what to do with it, which avoids the visible stutter of unmounting
          // and remounting the handler between scans.
          onBarcodeScanned={handleBarcodeScanned}
        />
      ) : (
        <View style={StyleSheet.absoluteFill} />
      )}

      {/* Dim everything outside the reticle so the eye goes to the frame */}
      <View style={styles.mask} pointerEvents="box-none">
        <View style={styles.maskBand} />
        <View style={styles.maskMiddle}>
          <View style={styles.maskSide} />
          <View style={{ width: FRAME_SIZE, height: FRAME_SIZE }}>
            <ScanFrame size={FRAME_SIZE} active={isActive && !isAdding} tone={frameTone} />
          </View>
          <View style={styles.maskSide} />
        </View>
        <View style={styles.maskBandBottom} />
      </View>

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']} pointerEvents="box-none">
        <View style={styles.topBar}>
          <IconButton
            icon="close"
            label="Close scanner"
            tone="glass"
            onPress={() => navigation.navigate('Tabs', { screen: 'Dashboard' })}
          />

          <View style={styles.titleBlock}>
            <Text variant="bodyMedium" style={styles.titleText}>
              Scan product
            </Text>
            <Text variant="caption" style={styles.subtitleText}>
              {isAdding ? 'Adding…' : 'Ready'}
            </Text>
          </View>

          <IconButton
            icon={torchOn ? 'flashlight' : 'flashlight-outline'}
            label={torchOn ? 'Turn torch off' : 'Turn torch on'}
            tone="glass"
            onPress={() => setTorchOn((current) => !current)}
          />
        </View>

        <View style={styles.spacer} pointerEvents="none" />

        <View style={styles.bottom}>
          <ScanResultCard
            outcome={lastScan}
            isAdding={isAdding}
            canManageCatalogue={isAdmin}
            onCreateProduct={handleCreateProduct}
            onOpenProduct={(productId) => navigation.navigate('ProductDetail', { productId })}
          />

          <View style={styles.tools}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Enter barcode manually"
              onPress={() => setManualOpen(true)}
              style={({ pressed }) => [styles.tool, pressed && styles.toolPressed]}
            >
              <Ionicons name="keypad-outline" size={18} color={colors.textInverse} />
              <Text variant="smallMedium" style={styles.toolText}>
                Manual
              </Text>
            </Pressable>

            {/* Running cart total, so the cashier never has to leave the camera */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open cart with ${cartCount} items, total ${formatCurrency(cartTotal)}`}
              onPress={() => navigation.navigate('Cart')}
              style={({ pressed }) => [styles.cartBar, pressed && styles.cartBarPressed]}
            >
              <View style={styles.cartIcon}>
                <Ionicons name="cart" size={18} color={colors.textOnPrimary} />
                {cartCount > 0 ? (
                  <View style={styles.cartBadge}>
                    <Text variant="caption" style={styles.cartBadgeText}>
                      {cartCount > 99 ? '99+' : cartCount}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.cartText}>
                <Text variant="caption" style={styles.cartLabel}>
                  {cartCount === 0 ? 'Cart is empty' : pluralise(cartCount, 'item')}
                </Text>
                <Text style={[typography.numeric, styles.cartTotal]}>{formatCurrency(cartTotal)}</Text>
              </View>

              <Ionicons name="chevron-forward" size={18} color={colors.textInverse} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <ManualEntrySheet
        visible={manualOpen}
        value={manualCode}
        error={manualError}
        onChange={handleManualChange}
        onClose={closeManual}
        onSubmit={handleManualSubmit}
      />
    </View>
  );
};

/**
 * Fallback for a damaged label or a camera that will not focus — a till cannot
 * be blocked by a scuffed barcode.
 *
 * The number pad suits printed EAN/UPC digits; own-label shelf tags can carry
 * letters, so the keyboard can be switched rather than leaving those codes
 * impossible to type.
 */
const ManualEntrySheet = ({
  visible,
  value,
  error,
  onChange,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) => {
  const [lettersMode, setLettersMode] = useState(false);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Enter barcode"
      subtitle="Type the code printed under the barcode"
      scrollable={false}
      footer={
        <View style={styles.sheetFooter}>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.sheetButton} />
          <Button
            label="Add to cart"
            icon="cart-outline"
            onPress={onSubmit}
            disabled={value.trim().length < 4}
            style={styles.sheetButton}
          />
        </View>
      }
    >
      <TextField
        // Remounting is what makes the new keyboard type take effect while focused.
        key={lettersMode ? 'letters' : 'digits'}
        value={value}
        onChangeText={onChange}
        placeholder={lettersMode ? 'SHELF-0042' : '8901030100000'}
        keyboardType={lettersMode ? 'default' : Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
        autoCapitalize={lettersMode ? 'characters' : 'none'}
        autoCorrect={false}
        autoFocus
        icon="barcode-outline"
        error={error ?? undefined}
        hint="Most grocery barcodes are 8 or 13 digits."
        action={{
          icon: lettersMode ? 'keypad-outline' : 'text-outline',
          label: lettersMode ? 'Use the number pad' : 'Type letters too',
          onPress: () => setLettersMode((current) => !current),
        }}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        containerStyle={styles.sheetField}
      />
    </Sheet>
  );
};

const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: colors.palette.neutral900 },

  permissionScreen: { flex: 1, backgroundColor: colors.background },
  permissionContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  permissionIcon: {
    width: 76,
    height: 76,
    borderRadius: radius.xxl,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  permissionText: { marginTop: spacing.sm, maxWidth: 320 },
  permissionButton: { marginTop: spacing.xl, marginBottom: spacing.sm },
  permissionResult: { alignSelf: 'stretch', marginTop: spacing.lg },

  mask: { ...StyleSheet.absoluteFill },
  maskBand: { flex: 1, backgroundColor: colors.scannerBackdrop },
  maskBandBottom: { flex: 1.5, backgroundColor: colors.scannerBackdrop },
  maskMiddle: { flexDirection: 'row', height: FRAME_SIZE },
  maskSide: { flex: 1, backgroundColor: colors.scannerBackdrop },

  overlay: { ...StyleSheet.absoluteFill, justifyContent: 'space-between' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  titleBlock: { alignItems: 'center' },
  titleText: { color: colors.textInverse },
  subtitleText: { color: 'rgba(255,255,255,0.65)' },
  spacer: { flex: 1 },

  bottom: { paddingHorizontal: spacing.base, paddingBottom: spacing.sm, gap: spacing.md },
  tools: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  toolPressed: { backgroundColor: 'rgba(255,255,255,0.24)' },
  toolText: { color: colors.textInverse },
  cartBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    ...shadows.primary,
  },
  cartBarPressed: { backgroundColor: colors.primaryPressed },
  cartIcon: { width: 30, alignItems: 'center', justifyContent: 'center' },
  cartBadge: {
    position: 'absolute',
    top: -6,
    right: -2,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.palette.neutral900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: { color: colors.textInverse, fontSize: 10 },
  cartText: { flex: 1, marginLeft: spacing.sm },
  cartLabel: { color: 'rgba(255,255,255,0.8)' },
  cartTotal: { color: colors.textInverse, fontSize: 16 },

  sheetField: { marginBottom: spacing.base },
  sheetFooter: { flexDirection: 'row', gap: spacing.sm },
  sheetButton: { flex: 1 },
});
