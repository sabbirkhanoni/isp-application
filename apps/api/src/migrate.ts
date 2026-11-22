import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/**
 * Applies prisma/migrations/<name>/migration.sql in order, once each, and remembers them in
 * schema_migrations. Runs before every deploy (render.yaml: preDeployCommand).
 *  - one migration = one transaction: a failure leaves the database as it was;
 *  - an advisory lock stops two deploys from migrating at the same time;
 *  - a migration file that changed after it was applied stops the deploy instead of being ignored.
 */
const MIGRATIONS_DIR = fileURLToPath(new URL('../prisma/migrations', import.meta.url));
const LOCK_KEY = 727_001;

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export async function migrate(
  connectionString: string,
  dir: string = MIGRATIONS_DIR,
  log: (message: string) => void = () => undefined,
): Promise<MigrationResult> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  const result: MigrationResult = { applied: [], skipped: [] };
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const done = new Map(
      (
        await client.query<{ name: string; checksum: string }>(
          'SELECT name, checksum FROM schema_migrations',
        )
      ).rows.map((r) => [r.name, r.checksum]),
    );

    const names = (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const name of names) {
      const sql = await readFile(path.join(dir, name, 'migration.sql'), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = done.get(name);
      if (previous !== undefined) {
        if (previous !== checksum) {
          throw new Error(
            `Migration ${name} was changed after it was applied. Add a new migration instead.`,
          );
        }
        result.skipped.push(name);
        continue;
      }
      log(`Applying ${name}`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
          name,
          checksum,
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(
          `Migration ${name} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      result.applied.push(name);
    }
    return result;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const url = process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'];
  if (!url) {
    process.stderr.write('DIRECT_URL or DATABASE_URL must be set\n');
    process.exit(1);
  }
  migrate(url, MIGRATIONS_DIR, (m) => process.stdout.write(`${m}\n`))
    .then((r) =>
      process.stdout.write(
        `Migrations done: ${r.applied.length} applied, ${r.skipped.length} already in place.\n`,
      ),
    )
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    });
}
