import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { createDb, closePool, type CreateDbOptions, type Db } from './client.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    dbStats: () => { total: number; idle: number; waiting: number };
  }
}

export interface RegisterDbOptions {
  /** Pre-created Db (used by tests). When provided, lifecycle ownership stays with caller. */
  db?: Db;
  /** Connection string used when `db` is not provided. */
  url?: string;
  /** Pool / driver tuning (ignored when `db` is provided). */
  poolMax?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
  statementTimeoutMs?: number;
  /** When true, log every drizzle-issued SQL at debug level. */
  logQueries?: boolean;
}

/**
 * Wires a Drizzle Db onto the Fastify instance, hooks pool errors into the
 * structured logger, and ensures the pool is drained on app.close().
 *
 * When `opts.db` is provided the caller owns the pool lifecycle (tests). When
 * created internally, this function registers an `onClose` hook to drain it.
 */
export function registerDb(app: FastifyInstance, opts: RegisterDbOptions): void {
  let db: Db;
  let owned = false;

  if (opts.db) {
    db = opts.db;
  } else {
    if (!opts.url) throw new Error('registerDb requires either `db` or `url`');
    const createOpts: CreateDbOptions = {
      onPoolError: (err) => app.log.error({ err }, 'pg pool error'),
    };
    if (opts.poolMax !== undefined) createOpts.poolMax = opts.poolMax;
    if (opts.idleTimeoutMs !== undefined) createOpts.idleTimeoutMs = opts.idleTimeoutMs;
    if (opts.connectionTimeoutMs !== undefined) createOpts.connectionTimeoutMs = opts.connectionTimeoutMs;
    if (opts.statementTimeoutMs !== undefined) createOpts.statementTimeoutMs = opts.statementTimeoutMs;
    if (opts.logQueries) createOpts.logger = makeDrizzleLogger(app.log);
    db = createDb(opts.url, createOpts);
    owned = true;
  }

  app.decorate('db', db);
  app.decorate('dbStats', () => ({
    total: db._pool.totalCount,
    idle: db._pool.idleCount,
    waiting: db._pool.waitingCount,
  }));

  if (owned) {
    app.addHook('onClose', async () => {
      await closePool(db);
    });
  }
}

function makeDrizzleLogger(log: FastifyBaseLogger): { logQuery: (q: string, p: unknown[]) => void } {
  return {
    logQuery(query, params) {
      log.debug({ sql: query, params }, 'db query');
    },
  };
}
