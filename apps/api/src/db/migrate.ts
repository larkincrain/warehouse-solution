/* eslint-disable no-console */
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { db, closeDb } from './client.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, '../../drizzle');

async function main() {
  const d = db();
  await migrate(d, { migrationsFolder });
  await closeDb();
  console.error('migrations applied');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
