import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Token storage.
 *
 * SecureStore is backed by the iOS Keychain and Android Keystore, which is
 * where refresh tokens belong. It has no web implementation, so the web build
 * falls back to AsyncStorage — acceptable there because the browser is already
 * the trust boundary, and the app targets phones.
 */
const isWeb = Platform.OS === 'web';

export const secureStorage = {
  async get(key: string): Promise<string | null> {
    try {
      return isWeb ? await AsyncStorage.getItem(key) : await SecureStore.getItemAsync(key);
    } catch {
      // A corrupted or unreadable entry must not block start-up; the user just
      // signs in again.
      return null;
    }
  },

  async set(key: string, value: string): Promise<void> {
    try {
      if (isWeb) await AsyncStorage.setItem(key, value);
      else await SecureStore.setItemAsync(key, value);
    } catch {
      // Ignored on purpose: failing to persist means a shorter session, not a
      // broken one.
    }
  },

  async remove(key: string): Promise<void> {
    try {
      if (isWeb) await AsyncStorage.removeItem(key);
      else await SecureStore.deleteItemAsync(key);
    } catch {
      /* nothing useful to do */
    }
  },
};

export const STORAGE_KEYS = {
  session: 'grocery.session',
  user: 'grocery.user',
} as const;
