import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Db = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 10 });
  const db = drizzle(pool, { schema });
  return Object.assign(db, { _pool: pool });
}

let _db: Db | null = null;

export function db(): Db {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is required');
    _db = createDb(url);
  }
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_db) {
    await _db._pool.end();
    _db = null;
  }
}
