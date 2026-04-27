import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export interface CreateDbOptions {
  poolMax?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
  statementTimeoutMs?: number;
  logger?: { logQuery: (query: string, params: unknown[]) => void };
  onPoolError?: (err: Error) => void;
}

export type Db = ReturnType<typeof drizzle<typeof schema>> & {
  _pool: pg.Pool;
};

export function createDb(connectionString: string, opts: CreateDbOptions = {}): Db {
  const pool = new pg.Pool({
    connectionString,
    max: opts.poolMax ?? 10,
    idleTimeoutMillis: opts.idleTimeoutMs ?? 30_000,
    connectionTimeoutMillis: opts.connectionTimeoutMs ?? 5_000,
    statement_timeout: opts.statementTimeoutMs ?? 10_000,
  });

  pool.on('error', (err) => {
    if (opts.onPoolError) {
      opts.onPoolError(err);
    } else {
      // Fallback only when no logger is wired (e.g. ad-hoc scripts/tests).
      // eslint-disable-next-line no-console
      console.error('pg pool error', err);
    }
  });

  const drizzleOpts: { schema: typeof schema; logger?: CreateDbOptions['logger'] } = { schema };
  if (opts.logger) drizzleOpts.logger = opts.logger;

  const db = drizzle(pool, drizzleOpts) as unknown as Db;
  Object.assign(db, { _pool: pool });
  return db;
}

export async function closePool(db: Db): Promise<void> {
  await db._pool.end();
}
