import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Db = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 10 });
  pool.on('error', (err) => {
    // Idle-client errors must not crash the process. Log to stderr;
    // structured logging is wired up at the Fastify layer (Task 14).
    // eslint-disable-next-line no-console
    console.error('pg pool error', err);
  });
  const db = drizzle(pool, { schema });
  return Object.assign(db, { _pool: pool });
}

let _db: Db | null = null;

/**
 * Lazy singleton accessor for the Drizzle DB client.
 * Reads `DATABASE_URL` from `process.env` on first call. Tests must set the
 * env var before any code calls `db()`. Throws if `DATABASE_URL` is unset.
 */
export function db(): Db {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is required');
    _db = createDb(url);
  }
  return _db;
}

/**
 * Drain the pool and reset the singleton. Safe to call multiple times.
 * Caller must ensure no new queries are issued during/after the drain
 * (Fastify's `app.close()` should run first on SIGTERM).
 */
export async function closeDb(): Promise<void> {
  if (_db) {
    await _db._pool.end();
    _db = null;
  }
}
