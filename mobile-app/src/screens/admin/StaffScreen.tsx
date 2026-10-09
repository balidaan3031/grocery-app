import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  AppHeader,
  Avatar,
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
import { staffApi } from '../../services/api';
import { useAuthStore, selectIsAdmin } from '../../store/authStore';
import { toast } from '../../store/uiStore';
import { colors, radius, spacing } from '../../theme';
import { AppError, fieldErrorsOf, messageOf } from '../../utils/errors';
import { pluralise } from '../../utils/format';
import type { AuthUser, UserRole } from '../../types';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'staff', label: 'Staff' },
  { value: 'admin', label: 'Admin' },
];

const ROLE_HINTS: Record<UserRole, string> = {
  staff: 'Runs the till and corrects stock. Cannot change products, prices or accounts.',
  admin: 'Everything staff can do, plus products, categories, prices and staff accounts.',
};

type SheetMode = 'create' | 'edit' | 'password';

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  password: string;
}

const EMPTY_FORM: FormState = { fullName: '', email: '', phone: '', role: 'staff', password: '' };

const displayName = (account: AuthUser): string => account.fullName || account.email;

/** Active accounts first, then admins, then by name — the order an admin looks for. */
const byRelevance = (a: AuthUser, b: AuthUser): number =>
  Number(b.isActive) - Number(a.isActive) ||
  (a.role === b.role ? 0 : a.role === 'admin' ? -1 : 1) ||
  displayName(a).localeCompare(displayName(b));

/**
 * Store accounts, for admins.
 *
 * Everything happens in one sheet whose mode changes — create, edit, reset
 * password — because each is a two-or-three field form, and a pushed screen per
 * form would be more navigation than content.
 *
 * Your own row is read-only: the API refuses self-deactivation and self-demotion
 * (so an admin always remains), and your own password changes from Profile,
 * where the current one is required.
 */
export const StaffScreen = () => {
  const isAdmin = useAuthStore(selectIsAdmin);
  const currentUserId = useAuthStore((state) => state.user?.id);

  const fetchStaff = useCallback(() => staffApi.list(), []);
  const { data, isLoading, isRefreshing, error, reload, refresh, setData } = useAsync(fetchStaff, {
    immediate: isAdmin,
  });

  const accounts = useMemo(() => [...(data ?? [])].sort(byRelevance), [data]);
  const activeCount = accounts.filter((account) => account.isActive).length;

  const [mode, setMode] = useState<SheetMode | null>(null);
  const [target, setTarget] = useState<AuthUser | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: '' }));
  };

  /** Swaps a changed account into the list, so the screen updates without a refetch. */
  const replaceAccount = (account: AuthUser) =>
    setData((current) => (current ?? []).map((item) => (item.id === account.id ? account : item)));

  const openCreate = () => {
    setTarget(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setMode('create');
  };

  const openEdit = (account: AuthUser) => {
    setTarget(account);
    setForm({
      ...EMPTY_FORM,
      fullName: account.fullName,
      email: account.email,
      phone: account.phone ?? '',
      role: account.role,
    });
    setErrors({});
    setMode('edit');
  };

  const openPasswordReset = () => {
    setForm((current) => ({ ...current, password: '' }));
    setErrors({});
    setMode('password');
  };

  const closeSheet = () => {
    if (!isSaving) setMode(null);
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};

    if (mode === 'create' || mode === 'edit') {
      if (!form.fullName.trim()) next.fullName = 'Enter their name';
    }
    if (mode === 'create' && !EMAIL_PATTERN.test(form.email.trim())) {
      next.email = 'Enter a valid email address';
    }
    if (mode === 'create' || mode === 'password') {
      if (form.password.length < 8) next.password = 'Use at least 8 characters';
      else if (form.password.length > 72) next.password = 'Use 72 characters or fewer';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!mode || !validate()) return;
    setIsSaving(true);

    try {
      if (mode === 'create') {
        const created = await staffApi.create({
          email: form.email.trim(),
          password: form.password,
          fullName: form.fullName.trim(),
          role: form.role,
          phone: form.phone.trim() || null,
        });
        setData((current) => [...(current ?? []), created]);
        toast.success(
          'Account created',
          `Give ${created.fullName} their password. They can change it from their profile.`,
        );
      } else if (mode === 'edit' && target) {
        const updated = await staffApi.update(target.id, {
          fullName: form.fullName.trim(),
          phone: form.phone.trim() || null,
          role: form.role,
        });
        replaceAccount(updated);
        toast.success('Account updated', displayName(updated));
      } else if (mode === 'password' && target) {
        await staffApi.resetPassword(target.id, form.password);
        toast.success('Password reset', `Give ${displayName(target)} the new password.`);
      }

      setMode(null);
    } catch (caught) {
      const fieldErrors = fieldErrorsOf(caught);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
      } else if (caught instanceof AppError && caught.code === 'CONFLICT') {
        // The only conflict an account form can hit is a taken email address.
        setErrors({ email: caught.message });
      } else {
        toast.error(
          mode === 'create'
            ? 'Could not create the account'
            : mode === 'password'
              ? 'Could not reset the password'
              : 'Could not save changes',
          messageOf(caught),
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = () => {
    if (!target) return;

    const account = target;
    const activating = !account.isActive;
    const name = displayName(account);

    Alert.alert(
      activating ? `Reactivate ${name}?` : `Deactivate ${name}?`,
      activating
        ? 'They will be able to sign in and use the till again.'
        : 'They are locked out on their next action and cannot sign in until reactivated. Their past sales stay on record.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: activating ? 'Reactivate' : 'Deactivate',
          style: activating ? 'default' : 'destructive',
          onPress: async () => {
            setIsSaving(true);
            try {
              const updated = await staffApi.setActive(account.id, activating);
              replaceAccount(updated);
              setMode(null);
              toast.success(activating ? 'Account reactivated' : 'Account deactivated', name);
            } catch (caught) {
              toast.error('Could not update the account', messageOf(caught));
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
      <Screen edges={['top']}>
        <AppHeader title="Staff accounts" showBack />
        <EmptyState
          icon="lock-closed-outline"
          title="Admins only"
          message="Ask a store admin to add or change staff accounts."
        />
      </Screen>
    );
  }

  const renderItem = ({ item }: { item: AuthUser }) => {
    const isSelf = item.id === currentUserId;

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${displayName(item)}, ${item.role}${item.isActive ? '' : ', deactivated'}`}
        disabled={isSelf}
        onPress={() => openEdit(item)}
        style={({ pressed }) => [
          styles.row,
          !item.isActive && styles.rowInactive,
          pressed && styles.rowPressed,
        ]}
      >
        <Avatar name={displayName(item)} size={42} tone={item.isActive ? 'primary' : 'neutral'} />

        <View style={styles.rowBody}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {item.fullName || 'Unnamed account'}
          </Text>
          <Text variant="small" tone="muted" numberOfLines={1}>
            {item.email}
          </Text>

          <View style={styles.badges}>
            <Badge
              label={item.role === 'admin' ? 'Admin' : 'Staff'}
              tone={item.role === 'admin' ? 'primary' : 'accent'}
              size="sm"
            />
            {item.isActive ? null : <Badge label="Deactivated" tone="danger" size="sm" dot />}
            {isSelf ? <Badge label="You" tone="neutral" size="sm" /> : null}
          </View>
        </View>

        {isSelf ? null : <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />}
      </Pressable>
    );
  };

  const sheetTitle =
    mode === 'create'
      ? 'New staff account'
      : mode === 'password'
        ? 'Reset password'
        : target
          ? displayName(target)
          : '';

  const sheetSubtitle =
    mode === 'create'
      ? 'They sign in with this email and password'
      : mode === 'password' && target
        ? `Sets a new password for ${target.email}`
        : target?.email;

  return (
    <Screen edges={['top']}>
      <AppHeader
        title="Staff accounts"
        subtitle={data ? `${pluralise(accounts.length, 'account')} · ${activeCount} active` : undefined}
        showBack
        right={
          <IconButton icon="person-add-outline" label="Add a staff account" tone="primary" size={38} onPress={openCreate} />
        }
      />

      {isLoading && !data ? (
        <ListSkeleton count={5} />
      ) : (
        <FlatList
          data={accounts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, accounts.length === 0 && styles.listEmpty]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            error ? (
              <ErrorState message={error} onRetry={reload} />
            ) : (
              <EmptyState
                icon="people-outline"
                title="No accounts yet"
                action={{ label: 'Add an account', icon: 'person-add-outline', onPress: openCreate }}
              />
            )
          }
          ListFooterComponent={
            accounts.length > 0 ? (
              <Text variant="caption" tone="muted" center style={styles.footnote}>
                Your own details and password are managed from Profile.
              </Text>
            ) : null
          }
          refreshing={isRefreshing}
          onRefresh={refresh}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Sheet
        visible={mode !== null}
        onClose={closeSheet}
        title={sheetTitle}
        subtitle={sheetSubtitle}
        footer={
          <View style={styles.sheetFooter}>
            <Button
              label={mode === 'password' ? 'Back' : 'Cancel'}
              variant="secondary"
              disabled={isSaving}
              onPress={() => (mode === 'password' && target ? setMode('edit') : closeSheet())}
              style={styles.sheetButton}
            />
            <Button
              label={mode === 'create' ? 'Create account' : mode === 'password' ? 'Set password' : 'Save'}
              loading={isSaving}
              onPress={handleSubmit}
              style={styles.sheetButton}
            />
          </View>
        }
      >
        {mode === 'password' ? (
          <TextField
            label="New password"
            required
            value={form.password}
            onChangeText={(value) => setField('password', value)}
            error={errors.password}
            secureTextEntry
            autoCapitalize="none"
            icon="key-outline"
            hint="At least 8 characters. Devices already signed in stay signed in — deactivate the account to cut off access straight away."
            containerStyle={styles.field}
          />
        ) : (
          <>
            <TextField
              label="Full name"
              required
              value={form.fullName}
              onChangeText={(value) => setField('fullName', value)}
              error={errors.fullName}
              icon="person-outline"
              placeholder="Anita Rao"
              containerStyle={styles.field}
            />

            {mode === 'create' ? (
              <TextField
                label="Email"
                required
                value={form.email}
                onChangeText={(value) => setField('email', value)}
                error={errors.email}
                icon="mail-outline"
                placeholder="anita@store.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="off"
                containerStyle={styles.field}
              />
            ) : null}

            <TextField
              label="Phone"
              value={form.phone}
              onChangeText={(value) => setField('phone', value)}
              error={errors.phone}
              icon="call-outline"
              placeholder="Optional"
              keyboardType="phone-pad"
              containerStyle={styles.field}
            />

            <Text variant="smallMedium" tone="secondary" style={styles.label}>
              Role
            </Text>
            <SegmentedControl
              options={ROLE_OPTIONS}
              value={form.role}
              onChange={(value) => setField('role', value)}
            />
            <Text variant="small" tone="muted" style={styles.roleHint}>
              {ROLE_HINTS[form.role]}
            </Text>

            {mode === 'create' ? (
              <TextField
                label="Temporary password"
                required
                value={form.password}
                onChangeText={(value) => setField('password', value)}
                error={errors.password}
                secureTextEntry
                autoCapitalize="none"
                icon="key-outline"
                hint="At least 8 characters. Share it with them in person."
                containerStyle={styles.passwordField}
              />
            ) : null}

            {mode === 'edit' && target ? (
              <View style={styles.accountActions}>
                <Button
                  label="Reset password"
                  icon="key-outline"
                  variant="secondary"
                  disabled={isSaving}
                  onPress={openPasswordReset}
                  fullWidth
                />
                <Button
                  label={target.isActive ? 'Deactivate account' : 'Reactivate account'}
                  icon={target.isActive ? 'person-remove-outline' : 'person-add-outline'}
                  variant={target.isActive ? 'ghost' : 'tonal'}
                  disabled={isSaving}
                  onPress={handleToggleActive}
                  fullWidth
                />
              </View>
            ) : null}
          </>
        )}
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
  rowBody: { flex: 1, marginHorizontal: spacing.md },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },

  footnote: { paddingVertical: spacing.lg },

  field: { marginBottom: spacing.base },
  label: { marginBottom: spacing.sm },
  roleHint: { marginTop: spacing.sm },
  passwordField: { marginTop: spacing.base },
  accountActions: { gap: spacing.sm, marginTop: spacing.lg },

  sheetFooter: { flexDirection: 'row', gap: spacing.sm },
  sheetButton: { flex: 1 },
});
