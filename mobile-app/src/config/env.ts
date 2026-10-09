import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Runtime configuration.
 *
 * `EXPO_PUBLIC_*` variables are inlined at build time by Expo, so they are read
 * as literal `process.env.X` accesses — destructuring or dynamic lookup would
 * defeat the transform and yield undefined.
 */
const explicitApiUrl = process.env.EXPO_PUBLIC_API_URL;
const explicitSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const explicitSupabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const DEFAULT_PORT = 4000;
const API_PREFIX = '/api/v1';

/**
 * Works out where the API lives when EXPO_PUBLIC_API_URL is not set.
 *
 * `localhost` means the device itself, so it only ever works in a simulator. On
 * a real phone running Expo Go the packager's own LAN address is the right
 * host, and Expo exposes it as `hostUri` — reusing it means a phone on the same
 * Wi-Fi just works with no manual IP editing.
 */
const inferDevApiUrl = (): string => {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost;

  const host = hostUri?.split(':')[0];

  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:${DEFAULT_PORT}${API_PREFIX}`;
  }

  // Android emulators reach the host machine through this alias, never localhost.
  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${DEFAULT_PORT}${API_PREFIX}`;
  }

  return `http://localhost:${DEFAULT_PORT}${API_PREFIX}`;
};

export const env = {
  apiUrl: explicitApiUrl?.replace(/\/+$/, '') || inferDevApiUrl(),
  /** Used only for direct Storage uploads; all data access goes through the API. */
  supabaseUrl: explicitSupabaseUrl ?? '',
  supabaseAnonKey: explicitSupabaseKey ?? '',
  storageBucket: process.env.EXPO_PUBLIC_SUPABASE_BUCKET ?? 'product-images',
  isDev: __DEV__,
} as const;

export const hasSupabaseStorage = Boolean(env.supabaseUrl && env.supabaseAnonKey);
