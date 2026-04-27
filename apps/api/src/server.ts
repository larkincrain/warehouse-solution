import { buildApp } from './app.js';
import { loadConfig } from './config.js';

async function main() {
  const cfg = loadConfig();

  const app = await buildApp({
    logLevel: cfg.LOG_LEVEL,
    nodeEnv: cfg.NODE_ENV,
    databaseUrl: cfg.DATABASE_URL,
    poolMax: cfg.DB_POOL_MAX,
    idleTimeoutMs: cfg.DB_IDLE_TIMEOUT_MS,
    connectionTimeoutMs: cfg.DB_CONNECTION_TIMEOUT_MS,
    statementTimeoutMs: cfg.DB_STATEMENT_TIMEOUT_MS,
    slowQueryMs: cfg.DB_SLOW_QUERY_MS,
    txMaxRetries: cfg.DB_TX_MAX_RETRIES,
    logQueries: cfg.LOG_LEVEL === 'debug' || cfg.LOG_LEVEL === 'trace',
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutting down');

    // app.close() runs the onClose hooks (drains the pool registered by registerDb).
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: cfg.PORT, host: '0.0.0.0' });
}

main().catch((e) => {
  // eslint-disable-next-line no-console -- logger isn't available if bootstrap fails
  console.error(e);
  process.exit(1);
});
