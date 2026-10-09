import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  message?: string;
  /** Optional right-hand action, e.g. "Add product" after an unknown scan. */
  action?: { label: string; onPress: () => void };
  duration: number;
}

interface UiState {
  toasts: Toast[];
  show: (toast: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

let counter = 0;
const nextId = (): string => `toast-${Date.now()}-${(counter += 1)}`;

/** At most this many toasts on screen; older ones are dropped, not queued. */
const MAX_VISIBLE = 3;

export const useUiStore = create<UiState>((set, get) => ({
  toasts: [],

  show: ({ duration = 2600, ...toast }) => {
    const id = nextId();
    set((state) => ({ toasts: [...state.toasts, { ...toast, id, duration }].slice(-MAX_VISIBLE) }));

    if (duration > 0) {
      setTimeout(() => get().dismiss(id), duration);
    }
    return id;
  },

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

  dismissAll: () => set({ toasts: [] }),
}));

/**
 * Imperative helpers.
 *
 * Non-React code (API layers, store actions) needs to raise feedback too, and
 * hooks are not available there.
 */
export const toast = {
  success: (title: string, message?: string) =>
    useUiStore.getState().show({ tone: 'success', title, message }),
  error: (title: string, message?: string) =>
    useUiStore.getState().show({ tone: 'error', title, message, duration: 3600 }),
  info: (title: string, message?: string) =>
    useUiStore.getState().show({ tone: 'info', title, message }),
  warning: (title: string, message?: string) =>
    useUiStore.getState().show({ tone: 'warning', title, message, duration: 3200 }),
  action: (
    tone: ToastTone,
    title: string,
    message: string | undefined,
    action: Toast['action'],
  ) => useUiStore.getState().show({ tone, title, message, action, duration: 5000 }),
};
