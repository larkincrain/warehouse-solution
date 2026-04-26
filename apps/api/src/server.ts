import { buildApp } from './app.js';
import { closeDb } from './db/client.js';
import { loadConfig } from './config.js';

async function main() {
  const cfg = loadConfig();
  const app = await buildApp({ logLevel: cfg.LOG_LEVEL, nodeEnv: cfg.NODE_ENV });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: cfg.PORT, host: '0.0.0.0' });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
