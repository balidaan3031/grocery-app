import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader, Button, Card, Divider, Screen, Text, TextField } from '../../components/ui';
import { useCartStore } from '../../store/cartStore';
import { toast } from '../../store/uiStore';
import { colors, radius, shadows, spacing, typography } from '../../theme';
import { formatCurrency, getCurrencySymbol, pluralise } from '../../utils/format';
import { AppError, stockDetailsOf } from '../../utils/errors';
import type { PaymentMethod } from '../../types';
import type { RootStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

const PAYMENT_OPTIONS: {
  value: PaymentMethod;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  hint: string;
}[] = [
  { value: 'cash', label: 'Cash', icon: 'cash-outline', hint: 'Paid at the counter' },
  { value: 'card', label: 'Card', icon: 'card-outline', hint: 'Debit or credit' },
  { value: 'upi', label: 'UPI', icon: 'phone-portrait-outline', hint: 'Scan and pay' },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal-circle-outline', hint: 'Wallet, voucher' },
];

/** Payment methods that carry a transaction reference worth recording. */
const REFERENCE_METHODS: PaymentMethod[] = ['card', 'upi', 'other'];

export const CheckoutScreen = () => {
  const navigation = useNavigation<Navigation>();
  // Footers sit on the bottom edge, under the home indicator or nav bar.
  const insets = useSafeAreaInsets();

  const cart = useCartStore((state) => state.cart);
  const isCheckingOut = useCartStore((state) => state.isCheckingOut);
  const checkout = useCartStore((state) => state.checkout);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [discountText, setDiscountText] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [notes, setNotes] = useState('');
  const [showCustomer, setShowCustomer] = useState(false);

  const totals = cart?.totals;
  const grossTotal = totals?.total ?? 0;

  // Some locales' decimal pads type a comma.
  const enteredDiscount = Number(discountText.replace(',', '.').replace(/[^0-9.]/g, ''));

  const discount = useMemo(() => {
    if (!Number.isFinite(enteredDiscount) || enteredDiscount <= 0) return 0;
    // Capped so the preview can never show a negative amount due; the database
    // clamps it the same way at checkout. Rounded to paise, as stored.
    return Math.round(Math.min(enteredDiscount, grossTotal) * 100) / 100;
  }, [enteredDiscount, grossTotal]);

  const payable = Math.max(grossTotal - discount, 0);
  const discountExceeds = enteredDiscount > grossTotal;
  const discountInvalid = discountText.trim() !== '' && !Number.isFinite(enteredDiscount);

  const handleConfirm = async () => {
    if (!cart || cart.items.length === 0) {
      toast.error('Cart is empty', 'Add at least one item before checking out.');
      return;
    }
    if (discountInvalid) {
      toast.error('Check the discount', 'Enter the discount as a number, or leave it empty.');
      return;
    }

    try {
      const order = await checkout({
        paymentMethod,
        discountAmount: discount,
        customerName: customerName.trim() || null,
        customerPhone: customerPhone.trim() || null,
        paymentReference: paymentReference.trim() || null,
        notes: notes.trim() || null,
      });

      navigation.replace('OrderSuccess', { orderId: order.id });
    } catch (error) {
      // A double tap: the first one is still completing the sale.
      if (error instanceof AppError && error.code === 'CHECKOUT_IN_PROGRESS') return;

      const stock = stockDetailsOf(error);

      if (stock) {
        // The most likely failure at a busy till: another device sold the last
        // unit while this customer was queuing. Name the product so the cashier
        // knows exactly what to pull from the bag.
        toast.error(
          'Not enough stock',
          `${stock.productName}: ${stock.available} left but ${stock.requested} in the cart.`,
        );
        return;
      }

      toast.error(
        'Checkout failed',
        error instanceof AppError ? error.message : 'Please try again.',
      );
    }
  };

  return (
    <Screen edges={['top']} avoidKeyboard>
      <AppHeader title="Checkout" subtitle={pluralise(totals?.itemCount ?? 0, 'item')} showBack />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Amount due first — it is what both people at the counter look at */}
        <Card variant="tinted" style={styles.amountCard}>
          <Text variant="caption" tone="secondary">
            AMOUNT DUE
          </Text>
          <Text style={[typography.numeric, styles.amount]} adjustsFontSizeToFit numberOfLines={1}>
            {formatCurrency(payable)}
          </Text>
          {discount > 0 ? (
            <Text variant="small" tone="secondary">
              {formatCurrency(grossTotal)} before {formatCurrency(discount)} discount
            </Text>
          ) : null}
        </Card>

        <Text variant="h3" style={styles.sectionTitle}>
          Payment method
        </Text>

        <View style={styles.methods}>
          {PAYMENT_OPTIONS.map((option) => {
            const isActive = option.value === paymentMethod;

            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={option.label}
                onPress={() => setPaymentMethod(option.value)}
                style={({ pressed }) => [
                  styles.method,
                  isActive && styles.methodActive,
                  pressed && !isActive && styles.methodPressed,
                ]}
              >
                <View style={[styles.methodIcon, isActive && styles.methodIconActive]}>
                  <Ionicons
                    name={option.icon}
                    size={19}
                    color={isActive ? colors.textOnPrimary : colors.textSecondary}
                  />
                </View>

                <Text variant="bodyMedium" tone={isActive ? 'primary' : 'default'}>
                  {option.label}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {option.hint}
                </Text>

                {isActive ? (
                  <View style={styles.methodCheck}>
                    <Ionicons name="checkmark-circle" size={17} color={colors.primary} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {REFERENCE_METHODS.includes(paymentMethod) ? (
          <TextField
            label="Payment reference"
            value={paymentReference}
            onChangeText={setPaymentReference}
            placeholder={paymentMethod === 'upi' ? 'UPI transaction id' : 'Auth code or last 4 digits'}
            icon="link-outline"
            autoCapitalize="characters"
            containerStyle={styles.field}
          />
        ) : null}

        <TextField
          label="Discount"
          value={discountText}
          onChangeText={setDiscountText}
          placeholder="0.00"
          keyboardType="decimal-pad"
          prefix={getCurrencySymbol()}
          error={
            discountInvalid
              ? 'Enter an amount, e.g. 20 or 12.50'
              : discountExceeds
                ? 'Discount cannot exceed the total; it will be capped.'
                : undefined
          }
          hint="Optional flat amount off this sale"
          containerStyle={styles.field}
        />

        {/* Customer details are optional and hidden by default: the common sale
            is anonymous, and an always-visible form slows every one of them. */}
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowCustomer((current) => !current)}
          style={styles.toggle}
        >
          <Ionicons
            name={showCustomer ? 'chevron-down' : 'chevron-forward'}
            size={16}
            color={colors.primary}
          />
          <Text variant="smallMedium" tone="primary" style={styles.toggleText}>
            {showCustomer ? 'Hide customer details' : 'Add customer details (optional)'}
          </Text>
        </Pressable>

        {showCustomer ? (
          <View style={styles.customerBlock}>
            <TextField
              label="Customer name"
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="Walk-in customer"
              icon="person-outline"
              containerStyle={styles.field}
            />
            <TextField
              label="Phone"
              value={customerPhone}
              onChangeText={setCustomerPhone}
              placeholder="Optional"
              icon="call-outline"
              keyboardType="phone-pad"
              containerStyle={styles.field}
            />
            <TextField
              label="Notes"
              value={notes}
              onChangeText={setNotes}
              placeholder="Anything worth recording about this sale"
              icon="document-text-outline"
              multiline
              numberOfLines={3}
              containerStyle={styles.field}
            />
          </View>
        ) : null}

        <Card variant="outlined" style={styles.breakdown}>
          <Row label="Subtotal" value={formatCurrency(totals?.subtotal ?? 0)} />
          {(totals?.taxAmount ?? 0) > 0 ? (
            <Row label="Tax" value={formatCurrency(totals?.taxAmount ?? 0)} />
          ) : null}
          {discount > 0 ? (
            <Row label="Discount" value={`− ${formatCurrency(discount)}`} tone="success" />
          ) : null}
          <Divider style={styles.breakdownDivider} />
          <Row label="Total payable" value={formatCurrency(payable)} emphasis />
        </Card>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: spacing.lg + insets.bottom }]}>
        <Button
          label={`Complete sale · ${formatCurrency(payable)}`}
          icon="checkmark-circle"
          size="lg"
          fullWidth
          loading={isCheckingOut}
          disabled={!cart || cart.items.length === 0}
          onPress={handleConfirm}
        />
        <Text variant="caption" tone="muted" center style={styles.footerNote}>
          Stock is deducted and the order recorded in one step.
        </Text>
      </View>
    </Screen>
  );
};

const Row = ({
  label,
  value,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: 'success';
}) => (
  <View style={styles.row}>
    <Text variant={emphasis ? 'bodyMedium' : 'body'} tone={emphasis ? 'default' : 'secondary'}>
      {label}
    </Text>
    <Text
      style={[
        typography.numeric,
        { fontSize: emphasis ? 19 : 15, color: tone === 'success' ? colors.success : colors.text },
      ]}
    >
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  content: { padding: spacing.base, paddingBottom: spacing.xl },
  amountCard: { alignItems: 'center', paddingVertical: spacing.lg },
  amount: { fontSize: 38, lineHeight: 46, color: colors.primaryDark, marginVertical: spacing.xs },
  sectionTitle: { marginTop: spacing.lg, marginBottom: spacing.md },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  method: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
  },
  methodActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  methodPressed: { backgroundColor: colors.surfaceAlt },
  methodIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  methodIconActive: { backgroundColor: colors.primary },
  methodCheck: { position: 'absolute', top: spacing.sm, right: spacing.sm },
  field: { marginTop: spacing.base },
  toggle: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg },
  toggleText: { marginLeft: spacing.xs },
  customerBlock: { marginTop: spacing.xs },
  breakdown: { marginTop: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  breakdownDivider: { marginVertical: spacing.sm },
  footer: {
    padding: spacing.base,
    paddingBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    ...shadows.lg,
  },
  footerNote: { marginTop: spacing.sm },
});
