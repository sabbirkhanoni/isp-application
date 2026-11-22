import pg from 'pg';
import { migrate } from '../src/migrate.js';
import { TEST_DATABASE_URL } from './test-config.js';

/** Creates a clean test database and applies every migration. */
export default async function setup(): Promise<void> {
  const target = new URL(TEST_DATABASE_URL);
  const dbName = target.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error(`Unsafe test database name: ${dbName}`);

  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();

  // The same runner that deploys production, so every test run also proves the migrations apply.
  await migrate(TEST_DATABASE_URL);
}
