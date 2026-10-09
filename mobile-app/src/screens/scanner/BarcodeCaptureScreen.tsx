import { useCallback, useRef, useState } from 'react';
import { AppState, Dimensions, Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CommonActions, useFocusEffect, useNavigation } from '@react-navigation/native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Button, IconButton, Text } from '../../components/ui';
import { ScanFrame } from '../../components/scanner/ScanFrame';
import { useScanFeedback } from '../../hooks/useScanFeedback';
import { useScanGate } from '../../hooks/useScanGate';
import { barcodeProblem, cleanBarcode } from '../../utils/barcode';
import { colors, radius, spacing } from '../../theme';
import type { RootScreenProps } from '../../navigation/types';

/** Same formats as the till scanner, so anything it can sell can be catalogued. */
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'itf14', 'codabar'] as const;

const FRAME_SIZE = Math.min(Dimensions.get('window').width * 0.72, 290);

/**
 * Scans a single barcode for the product form and hands it back.
 *
 * The form's scan button used to open the till scanner, which put the item in
 * the cart (or opened a second, empty product form) instead of filling the
 * field. This screen only reads: the code is written onto the form's own route
 * by key, then the screen closes, so whatever was typed into the form survives.
 */
export const BarcodeCaptureScreen = ({ route }: RootScreenProps<'BarcodeCapture'>) => {
  const navigation = useNavigation();
  const { returnKey } = route.params;
  const [permission, requestPermission] = useCameraPermissions();
  const feedback = useScanFeedback();
  const gate = useScanGate();

  const [torchOn, setTorchOn] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const done = useRef(false);

  useFocusEffect(
    useCallback(() => {
      setIsActive(true);
      gate.reset();
      const subscription = AppState.addEventListener('change', (state) => setIsActive(state === 'active'));
      return () => {
        setIsActive(false);
        setTorchOn(false);
        subscription.remove();
      };
    }, [gate]),
  );

  const handleScanned = useCallback(
    ({ data, type }: BarcodeScanningResult) => {
      const code = cleanBarcode(data ?? '');
      if (done.current || !code || !gate.offer(code, type, false)) return;

      const reason = barcodeProblem(code);
      if (reason) {
        // Keep scanning: the next packet may carry a usable code.
        setProblem(`${code} cannot be used: ${reason.toLowerCase()}.`);
        feedback.failure();
        return;
      }

      done.current = true;
      feedback.success();
      navigation.dispatch({
        ...CommonActions.setParams({ capturedBarcode: code, capturedAt: Date.now() }),
        source: returnKey,
      });
      navigation.goBack();
    },
    [gate, feedback, navigation, returnKey],
  );

  if (!permission) return <View style={styles.dark} />;

  if (!permission.granted) {
    const permanentlyDenied = !permission.canAskAgain;
    return (
      <SafeAreaView style={styles.permissionScreen} edges={['top', 'bottom']}>
        <View style={styles.permissionContent}>
          <Ionicons name="camera-outline" size={34} color={colors.primary} />
          <Text variant="h2" center style={styles.permissionTitle}>
            Camera access needed
          </Text>
          <Text variant="body" tone="secondary" center style={styles.permissionText}>
            {permanentlyDenied
              ? 'Camera permission was declined. Enable it in Settings, or type the barcode into the form.'
              : 'Allow camera access to read the barcode straight into the form.'}
          </Text>
          <Button
            label={permanentlyDenied ? 'Open Settings' : 'Allow camera'}
            icon={permanentlyDenied ? 'settings-outline' : 'camera'}
            size="lg"
            fullWidth
            onPress={() => (permanentlyDenied ? void Linking.openSettings() : void requestPermission())}
            style={styles.permissionButton}
          />
          <Button label="Type it instead" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.dark}>
      {isActive ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torchOn}
          barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
          onBarcodeScanned={handleScanned}
        />
      ) : null}

      <View style={styles.center} pointerEvents="none">
        <ScanFrame size={FRAME_SIZE} active={isActive} tone={problem ? 'error' : 'idle'} />
      </View>

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']} pointerEvents="box-none">
        <View style={styles.topBar}>
          <IconButton icon="close" label="Close scanner" tone="glass" onPress={() => navigation.goBack()} />
          <Text variant="bodyMedium" style={styles.title}>
            Scan the product barcode
          </Text>
          <IconButton
            icon={torchOn ? 'flashlight' : 'flashlight-outline'}
            label={torchOn ? 'Turn torch off' : 'Turn torch on'}
            tone="glass"
            onPress={() => setTorchOn((current) => !current)}
          />
        </View>

        <View style={styles.message}>
          <Text variant="small" style={styles.messageText} center>
            {problem ?? 'Hold the barcode inside the frame. It fills in the form — nothing is added to the cart.'}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: colors.palette.neutral900 },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  overlay: { ...StyleSheet.absoluteFill, justifyContent: 'space-between' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  title: { color: colors.textInverse },
  message: {
    margin: spacing.base,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  messageText: { color: colors.textInverse },

  permissionScreen: { flex: 1, backgroundColor: colors.background },
  permissionContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  permissionTitle: { marginTop: spacing.lg },
  permissionText: { marginTop: spacing.sm, maxWidth: 320 },
  permissionButton: { marginTop: spacing.xl, marginBottom: spacing.sm },
});
