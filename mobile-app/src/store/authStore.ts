import { create } from 'zustand';
import { authApi, configApi } from '../services/api';
import { registerAuthBridge } from '../services/apiClient';
import { STORAGE_KEYS, secureStorage } from '../services/secureStorage';
import { configureCurrency } from '../utils/format';
import { AppError, messageOf } from '../utils/errors';
import type { AppConfig, AuthSession, AuthUser } from '../types';

interface AuthState {
  user: AuthUser | null;
  session: AuthSession | null;
  config: AppConfig | null;
  /** True until the persisted session has been read — gates the splash screen. */
  isBootstrapping: boolean;
  isSigningIn: boolean;
  error: string | null;

  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (input: { fullName?: string; phone?: string | null; avatarUrl?: string | null }) => Promise<void>;
  clearError: () => void;
}

const persistSession = async (session: AuthSession | null, user: AuthUser | null): Promise<void> => {
  if (session && user) {
    await Promise.all([
      secureStorage.set(STORAGE_KEYS.session, JSON.stringify(session)),
      secureStorage.set(STORAGE_KEYS.user, JSON.stringify(user)),
    ]);
  } else {
    await Promise.all([
      secureStorage.remove(STORAGE_KEYS.session),
      secureStorage.remove(STORAGE_KEYS.user),
    ]);
  }
};

const readJson = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  config: null,
  isBootstrapping: true,
  isSigningIn: false,
  error: null,

  /**
   * Restores a session on cold start.
   *
   * The cached user is shown immediately and then revalidated against /auth/me,
   * so the app opens straight onto the dashboard instead of flashing the login
   * screen while a network round trip completes. If the token turns out to be
   * dead, the interceptor's refresh runs; only if that also fails is the
   * session cleared.
   */
  bootstrap: async () => {
    try {
      const [rawSession, rawUser] = await Promise.all([
        secureStorage.get(STORAGE_KEYS.session),
        secureStorage.get(STORAGE_KEYS.user),
      ]);

      const session = readJson<AuthSession>(rawSession);
      const cachedUser = readJson<AuthUser>(rawUser);

      if (session && cachedUser) {
        set({ session, user: cachedUser });
      }

      // Store config is public and cheap; failure here must not block sign-in.
      void configApi
        .get()
        .then((config) => {
          configureCurrency(config.currencySymbol, config.currencyCode);
          set({ config });
        })
        .catch(() => undefined);

      if (session && cachedUser) {
        try {
          const user = await authApi.me();
          set({ user });
          await persistSession(get().session, user);
        } catch (error) {
          // A refused or revoked session has already been cleared by the API
          // client. Anything else — no signal, the API waking up — keeps the
          // cached user, so a flaky connection at opening time does not sign
          // the till out.
          if (error instanceof AppError && (error.isAuthError || error.status === 403)) {
            await persistSession(null, null);
            set({ user: null, session: null });
          }
        }
      } else if (session || cachedUser) {
        // Half a stored session cannot be used; start clean.
        await persistSession(null, null);
      }
    } finally {
      // Whatever happened above, never leave the app on the splash screen.
      set({ isBootstrapping: false });
    }
  },

  login: async (email, password) => {
    set({ isSigningIn: true, error: null });
    try {
      const { user, session } = await authApi.login(email.trim(), password);
      await persistSession(session, user);
      set({ user, session, isSigningIn: false });
      return true;
    } catch (error) {
      set({ error: messageOf(error, 'Could not sign in'), isSigningIn: false });
      return false;
    }
  },

  logout: async () => {
    // Revoke server-side, but never let a network failure trap someone in a
    // session they asked to leave.
    try {
      await authApi.logout();
    } catch {
      /* signing out locally is the part that matters */
    }
    await persistSession(null, null);
    set({ user: null, session: null, error: null });
  },

  refreshUser: async () => {
    try {
      const user = await authApi.me();
      set({ user });
      await persistSession(get().session, user);
    } catch {
      /* keep the cached profile */
    }
  },

  updateProfile: async (input) => {
    const user = await authApi.updateProfile(input);
    set({ user });
    await persistSession(get().session, user);
  },

  clearError: () => set({ error: null }),
}));

/**
 * Wires the API client to this store.
 *
 * Registered at module load so the very first request already carries a token,
 * and so a 401 can rotate the stored session without the client importing the
 * store directly.
 */
registerAuthBridge({
  getSession: () => useAuthStore.getState().session,
  onSessionRefreshed: async (session) => {
    useAuthStore.setState({ session });
    const user = useAuthStore.getState().user;
    if (user) await persistSession(session, user);
  },
  onSessionExpired: async () => {
    await persistSession(null, null);
    useAuthStore.setState({ user: null, session: null });
  },
});

/** Selector helpers keep components subscribed to the narrowest slice. */
export const selectIsAuthenticated = (state: AuthState): boolean =>
  Boolean(state.user && state.session);
export const selectIsAdmin = (state: AuthState): boolean => state.user?.role === 'admin';
