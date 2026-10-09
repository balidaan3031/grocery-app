import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import {
  AppHeader,
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  Screen,
  Sheet,
  Text,
  TextField,
} from '../../components/ui';
import { authApi } from '../../services/api';
import { useAuthStore, selectIsAdmin } from '../../store/authStore';
import { useCartStore, selectCartCount } from '../../store/cartStore';
import { toast } from '../../store/uiStore';
import { env } from '../../config/env';
import { colors, radius, spacing } from '../../theme';
import { messageOf } from '../../utils/errors';
import type { RootStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export const ProfileScreen = () => {
  const navigation = useNavigation<Navigation>();

  const user = useAuthStore((state) => state.user);
  const isAdmin = useAuthStore(selectIsAdmin);
  const config = useAuthStore((state) => state.config);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const logout = useAuthStore((state) => state.logout);
  const cartCount = useCartStore(selectCartCount);

  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const openEdit = () => {
    setFullName(user?.fullName ?? '');
    setPhone(user?.phone ?? '');
    setEditOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!fullName.trim()) {
      toast.error('Name is required');
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile({ fullName: fullName.trim(), phone: phone.trim() || null });
      setEditOpen(false);
      toast.success('Profile updated');
    } catch (error) {
      toast.error('Could not save', messageOf(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error('Password too short', 'Use at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setIsSaving(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setPasswordOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed');
    } catch (error) {
      toast.error('Could not change password', messageOf(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    // A cart left mid-sale is real money on the counter; make signing out with
    // one an explicit decision rather than a stray tap.
    const message =
      cartCount > 0
        ? `You have ${cartCount} item${cartCount === 1 ? '' : 's'} in an open cart. They stay saved to your account and will be waiting when you sign back in.`
        : 'You will need your email and password to sign back in.';

    Alert.alert('Sign out?', message, [
      { text: 'Stay signed in', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  return (
    <Screen edges={['top']}>
      <AppHeader title="Profile" showBack />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card variant="outlined" style={styles.identityCard}>
          <Avatar name={user?.fullName || 'Store User'} size={64} />

          <Text variant="h2" style={styles.name}>
            {user?.fullName || 'Store User'}
          </Text>
          <Text variant="small" tone="secondary">
            {user?.email}
          </Text>

          <View style={styles.badges}>
            <Badge
              label={user?.role === 'admin' ? 'Administrator' : 'Store staff'}
              tone={user?.role === 'admin' ? 'primary' : 'accent'}
              icon={user?.role === 'admin' ? 'shield-checkmark-outline' : 'person-outline'}
              size="sm"
            />
            {user?.isActive ? <Badge label="Active" tone="success" size="sm" dot /> : null}
          </View>

          <Button
            label="Edit profile"
            icon="create-outline"
            variant="secondary"
            size="sm"
            onPress={openEdit}
            style={styles.editButton}
          />
        </Card>

        <Text variant="overline" tone="muted" style={styles.groupLabel}>
          ACCOUNT
        </Text>

        <Card variant="outlined" padding="none">
          <Row
            icon="key-outline"
            label="Change password"
            onPress={() => setPasswordOpen(true)}
          />
          <Divider inset={52} />
          <Row
            icon="call-outline"
            label="Phone"
            value={user?.phone || 'Not set'}
            onPress={openEdit}
          />
        </Card>

        <Text variant="overline" tone="muted" style={styles.groupLabel}>
          SHORTCUTS
        </Text>

        <Card variant="outlined" padding="none">
          <Row
            icon="cart-outline"
            label="Current cart"
            value={cartCount > 0 ? `${cartCount} item${cartCount === 1 ? '' : 's'}` : 'Empty'}
            onPress={() => navigation.navigate('Cart')}
          />
          <Divider inset={52} />
          <Row
            icon="time-outline"
            label="Stock history"
            onPress={() => navigation.navigate('MovementHistory')}
          />
          <Divider inset={52} />
          <Row
            icon="receipt-outline"
            label="Order history"
            onPress={() => navigation.navigate('Tabs', { screen: 'Orders' })}
          />
        </Card>

        {isAdmin ? (
          <>
            <Text variant="overline" tone="muted" style={styles.groupLabel}>
              ADMINISTRATION
            </Text>

            <Card variant="outlined" padding="none">
              <Row
                icon="people-outline"
                label="Staff accounts"
                onPress={() => navigation.navigate('Staff')}
              />
              <Divider inset={52} />
              <Row
                icon="grid-outline"
                label="Categories"
                onPress={() => navigation.navigate('Categories')}
              />
              <Divider inset={52} />
              <Row
                icon="archive-outline"
                label="Deactivated products"
                onPress={() =>
                  navigation.navigate('Tabs', { screen: 'Products', params: { showInactive: true } })
                }
              />
            </Card>
          </>
        ) : null}

        <Text variant="overline" tone="muted" style={styles.groupLabel}>
          STORE
        </Text>

        <Card variant="outlined" padding="none">
          <Row icon="storefront-outline" label="Store" value={config?.storeName ?? 'Fresh Mart'} />
          <Divider inset={52} />
          <Row
            icon="cash-outline"
            label="Currency"
            value={`${config?.currencySymbol ?? '₹'} ${config?.currencyCode ?? 'INR'}`}
          />
          <Divider inset={52} />
          <Row icon="server-outline" label="API" value={env.apiUrl} />
        </Card>

        <Button
          label="Sign out"
          icon="log-out-outline"
          variant="danger"
          fullWidth
          onPress={handleLogout}
          style={styles.logout}
        />

        <Text variant="caption" tone="muted" center style={styles.version}>
          Fresh Mart POS · v1.0.0
        </Text>
      </ScrollView>

      <Sheet
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit profile"
        subtitle="Your name appears on every order you ring up"
        footer={
          <View style={styles.sheetFooter}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => setEditOpen(false)}
              style={styles.sheetButton}
            />
            <Button
              label="Save"
              loading={isSaving}
              onPress={handleSaveProfile}
              style={styles.sheetButton}
            />
          </View>
        }
      >
        <TextField
          label="Full name"
          value={fullName}
          onChangeText={setFullName}
          icon="person-outline"
          required
          containerStyle={styles.sheetField}
        />
        <TextField
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          icon="call-outline"
          keyboardType="phone-pad"
          placeholder="Optional"
          containerStyle={styles.sheetField}
        />
      </Sheet>

      <Sheet
        visible={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title="Change password"
        subtitle="You will stay signed in on this device"
        footer={
          <View style={styles.sheetFooter}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => setPasswordOpen(false)}
              style={styles.sheetButton}
            />
            <Button
              label="Update"
              loading={isSaving}
              onPress={handleChangePassword}
              style={styles.sheetButton}
            />
          </View>
        }
      >
        <TextField
          label="Current password"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          icon="lock-closed-outline"
          containerStyle={styles.sheetField}
        />
        <TextField
          label="New password"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          icon="key-outline"
          hint="At least 8 characters"
          containerStyle={styles.sheetField}
        />
        <TextField
          label="Confirm new password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          icon="key-outline"
          error={
            confirmPassword.length > 0 && confirmPassword !== newPassword
              ? 'Passwords do not match'
              : undefined
          }
          containerStyle={styles.sheetField}
        />
      </Sheet>
    </Screen>
  );
};

const Row = ({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
}) => {
  const content = (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={colors.textSecondary} />
      </View>

      <Text variant="body" style={styles.rowLabel}>
        {label}
      </Text>

      {value ? (
        <Text variant="small" tone="muted" numberOfLines={1} style={styles.rowValue}>
          {value}
        </Text>
      ) : null}

      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.rowPressed : undefined)}
    >
      {content}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  content: { padding: spacing.base, paddingBottom: spacing.xl },
  identityCard: { alignItems: 'center', paddingVertical: spacing.lg },
  name: { marginTop: spacing.md },
  badges: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  editButton: { marginTop: spacing.base },

  groupLabel: { marginTop: spacing.lg, marginBottom: spacing.sm, marginLeft: spacing.xs },

  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.base },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rowLabel: { flex: 1 },
  rowValue: { maxWidth: '48%', marginRight: spacing.sm },

  logout: { marginTop: spacing.xl },
  version: { marginTop: spacing.lg },

  sheetField: { marginBottom: spacing.base },
  sheetFooter: { flexDirection: 'row', gap: spacing.sm },
  sheetButton: { flex: 1 },
});
