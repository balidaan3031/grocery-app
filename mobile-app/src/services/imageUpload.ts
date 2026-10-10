import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, hasSupabaseStorage } from '../config/env';
import { AppError } from '../utils/errors';
import { getFreshAccessToken } from './apiClient';

/**
 * Product image uploads.
 *
 * Images go straight from the device to Supabase Storage rather than through
 * the Node API: a several-megabyte photo has no reason to occupy an API worker,
 * and Storage already enforces the same rules via the RLS policies in migration
 * 0007. The API still owns every piece of *data* — only the bytes take this
 * shortcut, and only the resulting public URL is sent back to it.
 */
let client: SupabaseClient | null = null;

const getClient = (): SupabaseClient => {
  if (!hasSupabaseStorage) {
    throw new AppError({
      code: 'STORAGE_NOT_CONFIGURED',
      message:
        'Image upload is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
    });
  }

  // Storage authorises with the signed-in user's own JWT, so the upload runs as
  // that member of staff and the policy check is real rather than a formality.
  // The token is borrowed from the API client for each request rather than
  // handed over as a session: a client holding the refresh token refreshes it
  // on its own near expiry, spending the token the app still holds, and the
  // app's next refresh would then sign the user out.
  client ??= createClient(env.supabaseUrl, env.supabaseAnonKey, {
    accessToken: getFreshAccessToken,
  });

  return client;
};

const extensionOf = (uri: string): string => {
  const match = /\.(\w+)(?:\?.*)?$/.exec(uri);
  const ext = match?.[1]?.toLowerCase();
  return ext && ext.length <= 5 ? ext : 'jpg';
};

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

/**
 * Uploads a local image and returns its public URL.
 *
 * `arrayBuffer()` on the local file URI is the reliable path in React Native —
 * passing a `FormData` blob to supabase-js uploads a zero-byte object on some
 * Android builds.
 */
export const uploadProductImage = async (localUri: string, productSlug: string): Promise<string> => {
  const supabase = getClient();
  const extension = extensionOf(localUri);
  const contentType = MIME[extension] ?? 'image/jpeg';

  const response = await fetch(localUri);
  if (!response.ok) {
    throw new AppError({ code: 'UPLOAD_FAILED', message: 'Could not read the selected image' });
  }
  const bytes = await response.arrayBuffer();

  if (bytes.byteLength > 5 * 1024 * 1024) {
    throw new AppError({ code: 'UPLOAD_TOO_LARGE', message: 'Images must be 5 MB or smaller' });
  }

  // A timestamped path keeps every version addressable and sidesteps CDN
  // caching of a replaced image at the same URL.
  const safeSlug = productSlug.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40) || 'product';
  const path = `${safeSlug}-${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(env.storageBucket)
    .upload(path, bytes, { contentType, upsert: false });

  if (error) {
    throw new AppError({ code: 'UPLOAD_FAILED', message: error.message });
  }

  const { data } = supabase.storage.from(env.storageBucket).getPublicUrl(path);
  return data.publicUrl;
};

export { hasSupabaseStorage };
