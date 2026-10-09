/**
 * Creates the demo store accounts.
 *
 * Credentials belong to Supabase Auth, not to seed.sql, so they cannot be
 * inserted with plain SQL — this script uses the admin API instead. Run it once
 * after applying the migrations:
 *
 *   npm run seed:users
 */
import { supabaseAdmin } from '../config/supabase';
import { logger } from '../config/logger';
import type { UserRole } from '../types';

interface SeedUser {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  phone: string;
}

const SEED_USERS: SeedUser[] = [
  {
    email: 'admin@freshmart.test',
    password: 'Admin@12345',
    fullName: 'Priya Menon',
    role: 'admin',
    phone: '+91 98200 11223',
  },
  {
    email: 'staff@freshmart.test',
    password: 'Staff@12345',
    fullName: 'Rahul Verma',
    role: 'staff',
    phone: '+91 98200 44556',
  },
];

const findExistingUser = async (email: string): Promise<string | null> => {
  // The admin API has no get-by-email, so page through until a match is found.
  // Fine for a seed script against a handful of accounts.
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;

    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
};

const upsertUser = async (user: SeedUser): Promise<void> => {
  const existingId = await findExistingUser(user.email);

  const id =
    existingId ??
    (await (async () => {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: { full_name: user.fullName },
        // The new-user trigger trusts only app_metadata for the role (0008).
        app_metadata: { role: user.role, store_account: true },
      });
      if (error || !data.user) throw error ?? new Error('User was not created');
      return data.user.id;
    })());

  if (existingId) {
    // Re-running the seed resets the demo password, which is the point of a
    // demo account.
    const { error } = await supabaseAdmin.auth.admin.updateUserById(existingId, {
      password: user.password,
      user_metadata: { full_name: user.fullName },
      app_metadata: { role: user.role, store_account: true },
    });
    if (error) throw error;
  }

  const { error: profileError } = await supabaseAdmin
    .from('users')
    .upsert(
      {
        id,
        email: user.email,
        full_name: user.fullName,
        role: user.role,
        phone: user.phone,
        avatar_url: null,
        is_active: true,
      },
      { onConflict: 'id' },
    );

  if (profileError) throw profileError;

  logger.info(
    { email: user.email, role: user.role, action: existingId ? 'updated' : 'created' },
    'Seed user ready',
  );
};

const run = async (): Promise<void> => {
  for (const user of SEED_USERS) {
    await upsertUser(user);
  }

  logger.info('\nSeed accounts:\n' + SEED_USERS.map((u) => `  ${u.role.padEnd(5)} ${u.email}  ${u.password}`).join('\n'));
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.fatal({ err: error }, 'Seeding users failed');
    process.exit(1);
  });
