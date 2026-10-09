/**
 * Migration runner.
 *
 * Applies `supabase/migrations/*.sql` in filename order against DATABASE_URL,
 * then optionally `supabase/seed.sql`.
 *
 *   npm run db:migrate          apply pending migrations
 *   npm run db:migrate -- --seed    …and load the demo catalogue
 *   npm run db:status           show what is applied without changing anything
 *
 * Why a runner rather than pasting into the SQL Editor: applied migrations are
 * recorded in `public.schema_migrations` with a checksum, so re-running is a
 * no-op, a half-applied file cannot go unnoticed, and an edit to an
 * already-applied migration is caught instead of silently ignored.
 *
 * Each file runs inside its own transaction — a failure rolls that file back
 * whole, leaving the schema on the last good migration rather than halfway
 * through one.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Client } from 'pg';
import 'dotenv/config';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../supabase/migrations');
const SEED_FILE = path.resolve(__dirname, '../../../supabase/seed.sql');

const connectionString = process.env.DATABASE_URL;

const checksum = (contents: string): string =>
  createHash('sha256').update(contents.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);

interface Migration {
  name: string;
  sql: string;
  checksum: string;
}

const loadMigrations = (): Migration[] =>
  readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      return { name: file, sql, checksum: checksum(sql) };
    });

const LEDGER = `
  create table if not exists public.schema_migrations (
    name        text        primary key,
    checksum    text        not null,
    applied_at  timestamptz not null default now()
  );
`;

/**
 * Supabase requires TLS. `rejectUnauthorized: false` is the documented setting
 * for the pooled connection string, whose certificate is issued for the pooler
 * host rather than the project host.
 */
const connect = async (): Promise<Client> => {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
};

const applied = async (client: Client): Promise<Map<string, string>> => {
  const { rows } = await client.query<{ name: string; checksum: string }>(
    'select name, checksum from public.schema_migrations',
  );
  return new Map(rows.map((row) => [row.name, row.checksum]));
};

const status = async (): Promise<void> => {
  const client = await connect();
  try {
    await client.query(LEDGER);
    const done = await applied(client);
    const migrations = loadMigrations();

    console.log(`\nDatabase: ${maskUrl(connectionString!)}\n`);
    for (const migration of migrations) {
      const previous = done.get(migration.name);
      const mark =
        previous === undefined
          ? 'pending'
          : previous === migration.checksum
            ? 'applied'
            : 'CHANGED SINCE APPLIED';
      console.log(`  ${mark.padEnd(22)} ${migration.name}`);
    }

    const { rows } = await client.query<{ count: string }>(
      "select count(*)::text as count from information_schema.tables where table_schema = 'public'",
    );
    console.log(`\n  public schema holds ${rows[0]?.count ?? '0'} tables/views\n`);
  } finally {
    await client.end();
  }
};

const migrate = async (withSeed: boolean): Promise<void> => {
  const client = await connect();

  try {
    await client.query(LEDGER);
    const done = await applied(client);
    const migrations = loadMigrations();

    console.log(`\nDatabase: ${maskUrl(connectionString!)}`);
    console.log(`Found ${migrations.length} migration(s)\n`);

    let ran = 0;

    for (const migration of migrations) {
      const previous = done.get(migration.name);

      if (previous === migration.checksum) {
        console.log(`  · ${migration.name} — already applied`);
        continue;
      }

      if (previous !== undefined) {
        // Editing an applied migration means the database and the repo have
        // diverged; silently skipping would hide that.
        throw new Error(
          `${migration.name} has changed since it was applied.\n` +
            `Write a new migration instead of editing an applied one, or delete its\n` +
            `row from public.schema_migrations if you know the change is safe to re-run.`,
        );
      }

      process.stdout.write(`  → ${migration.name} … `);

      await client.query('begin');
      try {
        await client.query(migration.sql);
        await client.query(
          'insert into public.schema_migrations (name, checksum) values ($1, $2)',
          [migration.name, migration.checksum],
        );
        await client.query('commit');
        console.log('ok');
        ran += 1;
      } catch (error) {
        await client.query('rollback');
        console.log('FAILED');
        throw error;
      }
    }

    console.log(ran === 0 ? '\nNothing to do — schema is up to date.' : `\nApplied ${ran} migration(s).`);

    if (withSeed) {
      process.stdout.write('\n  → seed.sql … ');
      const seed = readFileSync(SEED_FILE, 'utf8');
      await client.query('begin');
      try {
        await client.query(seed);
        await client.query('commit');
        console.log('ok');
      } catch (error) {
        await client.query('rollback');
        console.log('FAILED');
        throw error;
      }
    }

    // PostgREST caches the schema; without this the new tables and functions
    // stay invisible to the API until its cache happens to refresh.
    await client.query("notify pgrst, 'reload schema'");
    console.log('\nPostgREST schema cache reload requested.\n');
  } finally {
    await client.end();
  }
};

/** Never print the password, even into a local terminal log. */
const maskUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.username}:***@${parsed.host}${parsed.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
};

const main = async (): Promise<void> => {
  if (!connectionString) {
    console.error(
      '\nDATABASE_URL is not set.\n\n' +
        'Supabase dashboard → Connect (top bar) → copy the connection string, then add\n' +
        'it to backend/.env as:\n\n' +
        '  DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres\n\n' +
        'Use the Session pooler (port 5432) — migrations need a real session, and the\n' +
        'transaction pooler on 6543 does not support all DDL.\n',
    );
    process.exit(1);
  }

  const args = process.argv.slice(2);
  if (args.includes('--status')) return status();
  return migrate(args.includes('--seed'));
};

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const err = error as { message?: string; code?: string; position?: string; hint?: string };
    console.error(`\n${err.code ? `[${err.code}] ` : ''}${err.message ?? String(error)}`);
    if (err.hint) console.error(`hint: ${err.hint}`);
    if (err.position) console.error(`at character position ${err.position} of the file`);
    console.error('');
    process.exit(1);
  });
