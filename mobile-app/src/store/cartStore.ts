import { create } from 'zustand';
import { cartApi, ordersApi } from '../services/api';
import { AppError, inactiveProductOf, messageOf, stockDetailsOf } from '../utils/errors';
import { cleanBarcode } from '../utils/barcode';
import type { Cart, CheckoutInput, Order, Product } from '../types';

/** What the last scan did — drives the scanner's feedback banner. */
export type ScanOutcome =
  | { status: 'idle' }
  | { status: 'added'; product: Product; quantityInCart: number; wasAlreadyInCart: boolean }
  | { status: 'not_found'; barcode: string }
  /** The barcode belongs to a deactivated product: restore it, do not create another. */
  | { status: 'inactive'; barcode: string; productId: string; productName: string }
  | { status: 'error'; barcode: string; message: string };

interface CartState {
  cart: Cart | null;
  isLoading: boolean;
  /** True while a scan is being resolved; the camera pauses on it. */
  isAdding: boolean;
  isCheckingOut: boolean;
  error: string | null;
  lastScan: ScanOutcome;
  /** Ids of items with a mutation in flight, so only that row shows a spinner. */
  pendingItemIds: string[];

  load: (options?: { silent?: boolean }) => Promise<void>;
  /** Resolves to null when the scan was not acted on (another one in flight, empty code). */
  scanBarcode: (barcode: string) => Promise<ScanOutcome | null>;
  addProduct: (productId: string, quantity?: number) => Promise<boolean>;
  setQuantity: (itemId: string, quantity: number) => Promise<void>;
  increment: (itemId: string) => Promise<void>;
  decrement: (itemId: string) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  clear: () => Promise<void>;
  checkout: (input: CheckoutInput) => Promise<Order>;
  resetScan: () => void;
  reset: () => void;
}

// Repeated camera detections of one code are collapsed by the scanner itself
// (hooks/useScanGate), which can see whether the code is still in view. The
// store acts on every call it gets, so manual entry is never swallowed.

export const useCartStore = create<CartState>((set, get) => ({
  cart: null,
  isLoading: false,
  isAdding: false,
  isCheckingOut: false,
  error: null,
  lastScan: { status: 'idle' },
  pendingItemIds: [],

  load: async ({ silent = false } = {}) => {
    if (!silent) set({ isLoading: true });
    try {
      const cart = await cartApi.get();
      set({ cart, error: null });
    } catch (error) {
      set({ error: messageOf(error, 'Could not load the cart') });
    } finally {
      set({ isLoading: false });
    }
  },

  /**
   * The scan-to-cart path.
   *
   * Returns the outcome instead of only setting state so the scanner can react
   * immediately — haptics, sound, banner — without waiting for a re-render.
   */
  scanBarcode: async (barcode) => {
    const code = cleanBarcode(barcode);

    // Returning the previous outcome here used to make the scanner replay its
    // haptics for every ignored frame; null means "nothing happened".
    if (!code || get().isAdding) return null;

    set({ isAdding: true });

    try {
      const result = await cartApi.addByBarcode(code, 1);
      const outcome: ScanOutcome = {
        status: 'added',
        product: result.product,
        quantityInCart: result.quantityInCart,
        wasAlreadyInCart: result.wasAlreadyInCart,
      };
      set({ cart: result.cart, lastScan: outcome, isAdding: false, error: null });
      return outcome;
    } catch (error) {
      // An unknown barcode is a normal outcome, not a failure — the scanner
      // offers to create the product.
      const inactive = inactiveProductOf(error);
      const outcome: ScanOutcome = inactive
        ? { status: 'inactive', barcode: code, ...inactive }
        : error instanceof AppError && error.isProductNotFound
          ? { status: 'not_found', barcode: code }
          : { status: 'error', barcode: code, message: messageOf(error, 'Could not add that item') };

      set({ lastScan: outcome, isAdding: false });
      return outcome;
    }
  },

  addProduct: async (productId, quantity = 1) => {
    set({ isAdding: true });
    try {
      const result = await cartApi.addByProduct(productId, quantity);
      set({ cart: result.cart, isAdding: false, error: null });
      return true;
    } catch (error) {
      set({ error: messageOf(error, 'Could not add that item'), isAdding: false });
      throw error;
    }
  },

  /**
   * Quantity changes are applied optimistically — a stepper that waits for the
   * network feels broken — and rolled back if the server disagrees.
   */
  setQuantity: async (itemId, quantity) => {
    const previous = get().cart;
    if (!previous) return;

    if (quantity < 1) return get().removeItem(itemId);

    const optimistic: Cart = {
      ...previous,
      items: previous.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              quantity,
              lineSubtotal: round2(item.unit_price * quantity),
              lineTax: round2((item.unit_price * quantity * item.tax_rate) / 100),
              lineTotal: round2(
                item.unit_price * quantity + (item.unit_price * quantity * item.tax_rate) / 100,
              ),
            }
          : item,
      ),
    };
    set({ cart: withTotals(optimistic), pendingItemIds: [...get().pendingItemIds, itemId] });

    try {
      const cart = await cartApi.setQuantity(itemId, quantity);
      set({ cart, error: null });
    } catch (error) {
      const stock = stockDetailsOf(error);
      set({
        cart: previous,
        error: stock
          ? `Only ${stock.available} left of ${stock.productName}`
          : messageOf(error, 'Could not update the quantity'),
      });
      throw error;
    } finally {
      set({ pendingItemIds: get().pendingItemIds.filter((id) => id !== itemId) });
    }
  },

  increment: async (itemId) => {
    const item = get().cart?.items.find((candidate) => candidate.id === itemId);
    if (item) await get().setQuantity(itemId, item.quantity + 1);
  },

  decrement: async (itemId) => {
    const item = get().cart?.items.find((candidate) => candidate.id === itemId);
    if (item) await get().setQuantity(itemId, item.quantity - 1);
  },

  removeItem: async (itemId) => {
    const previous = get().cart;
    if (!previous) return;

    set({
      cart: withTotals({ ...previous, items: previous.items.filter((item) => item.id !== itemId) }),
      pendingItemIds: [...get().pendingItemIds, itemId],
    });

    try {
      const cart = await cartApi.removeItem(itemId);
      set({ cart, error: null });
    } catch (error) {
      set({ cart: previous, error: messageOf(error, 'Could not remove that item') });
      // Rethrown so the screen can say why the row came back.
      throw error;
    } finally {
      set({ pendingItemIds: get().pendingItemIds.filter((id) => id !== itemId) });
    }
  },

  clear: async () => {
    const previous = get().cart;
    if (previous) set({ cart: withTotals({ ...previous, items: [] }) });

    try {
      const cart = await cartApi.clear();
      set({ cart, error: null });
    } catch (error) {
      if (previous) set({ cart: previous });
      set({ error: messageOf(error, 'Could not clear the cart') });
      throw error;
    }
  },

  checkout: async (input) => {
    // A second tap before the button re-renders as busy must not ring the
    // sale up twice.
    if (get().isCheckingOut) {
      throw new AppError({ code: 'CHECKOUT_IN_PROGRESS', message: 'This sale is already being completed.' });
    }
    set({ isCheckingOut: true, error: null });
    try {
      const order = await ordersApi.checkout(input);
      // Checkout closes the cart server-side; reload to pick up the new empty one.
      await get().load({ silent: true });
      set({ isCheckingOut: false, lastScan: { status: 'idle' } });
      return order;
    } catch (error) {
      set({ isCheckingOut: false, error: messageOf(error, 'Checkout failed') });
      throw error;
    }
  },

  resetScan: () => set({ lastScan: { status: 'idle' } }),

  reset: () => {
    set({
      cart: null,
      isLoading: false,
      isAdding: false,
      isCheckingOut: false,
      error: null,
      lastScan: { status: 'idle' },
      pendingItemIds: [],
    });
  },
}));

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Recomputes the summary after an optimistic edit, matching the server's maths. */
const withTotals = (cart: Cart): Cart => {
  const subtotal = round2(cart.items.reduce((sum, item) => sum + item.lineSubtotal, 0));
  const taxAmount = round2(cart.items.reduce((sum, item) => sum + item.lineTax, 0));
  return {
    ...cart,
    totals: {
      subtotal,
      taxAmount,
      total: round2(subtotal + taxAmount),
      itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
      distinctItems: cart.items.length,
    },
  };
};

export const selectCartCount = (state: CartState): number => state.cart?.totals.itemCount ?? 0;
export const selectCartTotal = (state: CartState): number => state.cart?.totals.total ?? 0;
