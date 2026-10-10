import type { Session } from '@supabase/supabase-js';
import { createAuthClient, supabaseAdmin } from '../config/supabase';
import { ApiError } from '../utils/ApiError';
import { toApiError, unwrap } from '../utils/supabaseError';
import { logger } from '../config/logger';
import type { AuthSession, AuthenticatedUser, LoginResult, UserRole, UserRow } from '../types';

export const toAuthenticatedUser = (row: UserRow): AuthenticatedUser => ({
  id: row.id,
  email: row.email,
  fullName: row.full_name,
  role: row.role,
  phone: row.phone,
  avatarUrl: row.avatar_url,
  isActive: row.is_active,
});

const toSession = (session: Session): AuthSession => ({
  accessToken: session.access_token,
  refreshToken: session.refresh_token,
  expiresAt: session.expires_at ?? null,
  tokenType: session.token_type,
});

const loadProfile = async (userId: string): Promise<UserRow> =>
  unwrap(
    await supabaseAdmin.from('users').select('*').eq('id', userId).single(),
    'User profile',
  );

/**
 * Exchanges credentials for a Supabase session.
 *
 * A wrong password and an unknown email deliberately return the same message —
 * distinguishing them would turn the endpoint into an account enumerator.
 */
export const login = async (email: string, password: string): Promise<LoginResult> => {
  const { data, error } = await createAuthClient().auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    logger.warn({ email, reason: error?.message }, 'Failed sign-in attempt');
    throw ApiError.unauthorized('Incorrect email or password');
  }

  const profile = await loadProfile(data.user.id);

  if (!profile.is_active) {
    // Do not leave a usable session behind for a disabled account.
    await supabaseAdmin.auth.admin.signOut(data.session.access_token).catch(() => undefined);
    throw ApiError.accountDeactivated('This account has been deactivated. Contact your store admin.');
  }

  return { user: toAuthenticatedUser(profile), session: toSession(data.session) };
};

/**
 * Revokes the presented session so a signed-out device cannot keep using it.
 * Only this session: the default scope is global, which also signed out every
 * other till using the same account.
 */
export const logout = async (accessToken: string): Promise<void> => {
  const { error } = await supabaseAdmin.auth.admin.signOut(accessToken, 'local');
  // An already-expired token is a successful logout from the user's point of view.
  if (error && !/token|session/i.test(error.message)) {
    logger.warn({ err: error }, 'Sign-out did not revoke cleanly');
  }
};

export const refresh = async (refreshToken: string): Promise<LoginResult> => {
  const { data, error } = await createAuthClient().auth.refreshSession({ refresh_token: refreshToken });

  if (error || !data.session || !data.user) {
    throw ApiError.unauthorized('Session could not be refreshed, please sign in again');
  }

  const profile = await loadProfile(data.user.id);
  if (!profile.is_active) {
    throw ApiError.accountDeactivated();
  }

  return { user: toAuthenticatedUser(profile), session: toSession(data.session) };
};

export const getCurrentUser = async (userId: string): Promise<AuthenticatedUser> =>
  toAuthenticatedUser(await loadProfile(userId));

export interface UpdateProfileInput {
  fullName?: string;
  phone?: string | null;
  avatarUrl?: string | null;
}

export const updateProfile = async (
  userId: string,
  input: UpdateProfileInput,
): Promise<AuthenticatedUser> => {
  const patch: Partial<Omit<UserRow, 'id' | 'created_at'>> = {};
  if (input.fullName !== undefined) patch.full_name = input.fullName;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;

  const updated = unwrap(
    await supabaseAdmin.from('users').update(patch).eq('id', userId).select('*').single(),
    'User profile',
  );

  return toAuthenticatedUser(updated);
};

/**
 * Re-authenticating with the current password before changing it stops a stolen
 * access token from being enough to lock the real owner out.
 */
export const changePassword = async (
  user: AuthenticatedUser,
  currentPassword: string,
  newPassword: string,
): Promise<void> => {
  const { data: verified, error: verifyError } = await createAuthClient().auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (verifyError) {
    // Not 401: the caller's own session is fine, and a client treats 401 as
    // "refresh the token and retry", which would only repeat the same answer.
    throw new ApiError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect');
  }

  // The check opened a session of its own; nothing will ever use it.
  if (verified.session) {
    await supabaseAdmin.auth.admin
      .signOut(verified.session.access_token, 'local')
      .catch(() => undefined);
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    password: newPassword,
  });

  if (error) {
    throw ApiError.badRequest(error.message);
  }
};

export interface CreateStaffInput {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  phone?: string | null;
}

/**
 * Creates a store account. The `on_auth_user_created` trigger materialises the
 * public.users row as the auth user is created.
 *
 * The role travels in `app_metadata`, which only the service-role key can
 * write: the trigger ignores anything in `user_metadata`, because whoever signs
 * up chooses that (see migration 0008).
 */
export const createStaffAccount = async (input: CreateStaffInput): Promise<AuthenticatedUser> => {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
    app_metadata: { role: input.role, store_account: true },
  });

  if (error || !data.user) {
    if (error?.message && /already/i.test(error.message)) {
      throw ApiError.conflict('An account with this email already exists');
    }
    throw ApiError.badRequest(error?.message ?? 'Could not create the account');
  }

  // The trigger defaults from metadata; this settles anything it cannot know.
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .update({
      full_name: input.fullName,
      role: input.role,
      phone: input.phone ?? null,
      is_active: true,
    })
    .eq('id', data.user.id)
    .select('*')
    .single();

  if (profileError || !profile) {
    // A login without a store profile can never be used, yet it would hold the
    // email address and turn the admin's retry into a 409. Remove it.
    const { error: cleanupError } = await supabaseAdmin.auth.admin.deleteUser(data.user.id);
    if (cleanupError) {
      logger.error(
        { err: cleanupError, userId: data.user.id },
        'Could not remove auth user after profile creation failed',
      );
    }
    throw profileError
      ? toApiError(profileError, 'User profile')
      : ApiError.internal('Could not create the store profile');
  }

  return toAuthenticatedUser(profile);
};

export interface UpdateStaffInput {
  fullName?: string;
  phone?: string | null;
  role?: UserRole;
}

export const updateStaffAccount = async (
  userId: string,
  input: UpdateStaffInput,
): Promise<AuthenticatedUser> => {
  const patch: Partial<Omit<UserRow, 'id' | 'created_at'>> = {};
  if (input.fullName !== undefined) patch.full_name = input.fullName;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.role !== undefined) patch.role = input.role;

  const updated = unwrap(
    await supabaseAdmin.from('users').update(patch).eq('id', userId).select('*').single(),
    'User',
  );

  return toAuthenticatedUser(updated);
};

/**
 * Admin-set password, for a member of staff who has forgotten theirs.
 *
 * Existing sessions are not revoked — Supabase's admin API cannot sign a user
 * out by id. Deactivating the account is what cuts access off immediately.
 */
export const resetUserPassword = async (userId: string, password: string): Promise<void> => {
  // Confirms the target is a store account, and answers 404 rather than
  // whatever Auth says about an id it has never seen.
  await loadProfile(userId);

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
  if (error) {
    throw ApiError.badRequest(error.message);
  }
};

export const listStaff = async (): Promise<AuthenticatedUser[]> => {
  const rows = unwrap(
    await supabaseAdmin.from('users').select('*').order('created_at', { ascending: true }),
    'Users',
  );
  return rows.map(toAuthenticatedUser);
};

export const setUserActive = async (userId: string, isActive: boolean): Promise<AuthenticatedUser> => {
  const profile = unwrap(
    await supabaseAdmin.from('users').update({ is_active: isActive }).eq('id', userId).select('*').single(),
    'User',
  );
  return toAuthenticatedUser(profile);
};
