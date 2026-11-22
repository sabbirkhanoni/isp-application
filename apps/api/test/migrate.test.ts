import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../src/migrate.js';
import { TEST_DATABASE_URL } from './test-config.js';

const REAL = fileURLToPath(new URL('../prisma/migrations', import.meta.url));
const DB = 'isp_migrate_check';
const url = (() => {
  const u = new URL(TEST_DATABASE_URL);
  u.pathname = `/${DB}`;
  return u.toString();
})();
let admin: pg.Client;
let work: string;

const query = async <T extends pg.QueryResultRow>(sql: string) => {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return (await c.query<T>(sql)).rows;
  } finally {
    await c.end();
  }
};

beforeAll(async () => {
  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';
  admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  work = await mkdtemp(path.join(tmpdir(), 'migrations-'));
});
afterAll(async () => {
  await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin.end();
  await rm(work, { recursive: true, force: true });
});

async function freshDb() {
  await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${DB}`);
}

describe('migration runner', () => {
  it('applies every migration once and does nothing the second time', async () => {
    await freshDb();
    const first = await migrate(url);
    expect(first.applied.length).toBeGreaterThanOrEqual(5);
    expect(first.applied).toContain('0005_network');
    const second = await migrate(url);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(first.applied);
    const tables = await query<{ n: string }>(
      "SELECT table_name AS n FROM information_schema.tables WHERE table_name IN ('customers','network_jobs')",
    );
    expect(tables).toHaveLength(2);
  });

  it('rolls a failing migration back completely and keeps the earlier ones', async () => {
    await freshDb();
    const dir = path.join(work, 'failing');
    await mkdir(path.join(dir, '0001_ok'), { recursive: true });
    await mkdir(path.join(dir, '0002_bad'), { recursive: true });
    await writeFile(path.join(dir, '0001_ok', 'migration.sql'), 'CREATE TABLE a (id int);');
    await writeFile(
      path.join(dir, '0002_bad', 'migration.sql'),
      'CREATE TABLE b (id int); SELECT 1/0;',
    );
    await expect(migrate(url, dir)).rejects.toThrow(/0002_bad failed/);
    const names = await query<{ name: string }>('SELECT name FROM schema_migrations');
    expect(names.map((r) => r.name)).toEqual(['0001_ok']);
    expect(
      await query("SELECT 1 FROM information_schema.tables WHERE table_name = 'b'"),
    ).toHaveLength(0);
  });

  it('refuses to continue when an applied migration file was edited', async () => {
    await freshDb();
    const dir = path.join(work, 'edited');
    await cp(REAL, dir, { recursive: true });
    await migrate(url, dir);
    const file = path.join(dir, '0001_init', 'migration.sql');
    await writeFile(file, `${await readFile(file, 'utf8')}\n-- tampered`);
    await expect(migrate(url, dir)).rejects.toThrow(/changed after it was applied/);
  });
});
