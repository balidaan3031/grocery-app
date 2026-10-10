import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Button, Text, TextField } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, shadows, spacing } from '../../theme';

interface FormErrors {
  email?: string;
  password?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LoginScreen = () => {
  const login = useAuthStore((state) => state.login);
  const isSigningIn = useAuthStore((state) => state.isSigningIn);
  const serverError = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  const passwordRef = useRef<TextInput>(null);

  /**
   * Validated locally first so an obviously-malformed email never costs a round
   * trip — and, more usefully, never burns one of the login rate limiter's
   * attempts.
   */
  const validate = (): boolean => {
    const next: FormErrors = {};
    if (!email.trim()) next.email = 'Enter your email';
    else if (!EMAIL_PATTERN.test(email.trim())) next.email = 'That does not look like an email';
    if (!password) next.password = 'Enter your password';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    // Guarded here rather than by making the fields read-only while signing
    // in: toggling `editable` drops focus and freezes the form for as long as
    // the request takes, then leaves the cashier re-tapping a field.
    if (isSigningIn) return;
    clearError();
    if (!validate()) return;
    await login(email, password);
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.palette.green600, colors.palette.green500, colors.palette.teal500]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Padding on Android too: it draws edge-to-edge, so the window is no
            longer resized and the keyboard would cover the password field. */}
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.brand}>
              <View style={styles.mark}>
                <Ionicons name="basket" size={32} color={colors.palette.green600} />
              </View>
              <Text variant="h1" style={styles.brandTitle}>
                Fresh Mart
              </Text>
              <Text variant="body" style={styles.brandSubtitle}>
                Sign in to open the till
              </Text>
            </View>

            <View style={styles.card}>
              <Text variant="h2">Welcome back</Text>
              <Text variant="small" tone="secondary" style={styles.cardSubtitle}>
                Use the store account your admin gave you.
              </Text>

              <TextField
                label="Email"
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  if (errors.email) setErrors((current) => ({ ...current, email: undefined }));
                }}
                error={errors.email}
                icon="mail-outline"
                placeholder="you@store.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                containerStyle={styles.field}
              />

              <TextField
                ref={passwordRef}
                label="Password"
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  if (errors.password) setErrors((current) => ({ ...current, password: undefined }));
                }}
                error={errors.password}
                icon="lock-closed-outline"
                placeholder="••••••••"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
                containerStyle={styles.field}
              />

              {serverError ? (
                <View style={styles.banner}>
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  <Text variant="small" tone="danger" style={styles.bannerText}>
                    {serverError}
                  </Text>
                </View>
              ) : null}

              <Button
                label="Sign in"
                icon="arrow-forward"
                iconPosition="right"
                size="lg"
                fullWidth
                loading={isSigningIn}
                onPress={handleSubmit}
                style={styles.submit}
              />
            </View>

            <Text variant="caption" tone="muted" center style={styles.footer}>
              Trouble signing in? Ask your store admin to reset your password.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  // The gradient runs behind the top of the card so the brand block sits on
  // colour and the form sits on white — one continuous surface, two zones.
  hero: { position: 'absolute', top: 0, left: 0, right: 0, height: '46%' },
  safe: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  brand: { alignItems: 'center', marginBottom: spacing.xl },
  mark: {
    width: 68,
    height: 68,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.md,
  },
  brandTitle: { color: colors.textInverse },
  brandSubtitle: { color: 'rgba(255,255,255,0.88)', marginTop: 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadows.lg,
  },
  cardSubtitle: { marginTop: spacing.xs, marginBottom: spacing.lg },
  field: { marginBottom: spacing.base },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  bannerText: { flex: 1, marginLeft: spacing.sm },
  submit: { marginTop: spacing.md },
  footer: { marginTop: spacing.xl },
});
