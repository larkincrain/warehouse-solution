/* eslint-disable no-console */
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDb, closePool } from './client.js';
import { loadConfig } from '../config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, '../../drizzle');

async function main() {
  const cfg = loadConfig();
  const d = createDb(cfg.DATABASE_URL);
  await migrate(d, { migrationsFolder });
  await closePool(d);
  console.error('migrations applied');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
