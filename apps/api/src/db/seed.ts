/* eslint-disable no-console */
import { sql } from 'drizzle-orm';
import { createDb, closePool } from './client.js';
import { warehouses } from './schema.js';
import { loadConfig } from '../config.js';

const SEED = [
  { id: 'los-angeles', name: 'Los Angeles', latitude: 33.9425,    longitude: -118.408056, stock: 355 },
  { id: 'new-york',    name: 'New York',    latitude: 40.639722,  longitude: -73.778889,  stock: 578 },
  { id: 'sao-paulo',   name: 'São Paulo',   latitude: -23.435556, longitude: -46.473056,  stock: 265 },
  { id: 'paris',       name: 'Paris',       latitude: 49.009722,  longitude: 2.547778,    stock: 694 },
  { id: 'warsaw',      name: 'Warsaw',      latitude: 52.165833,  longitude: 20.967222,   stock: 245 },
  { id: 'hong-kong',   name: 'Hong Kong',   latitude: 22.308889,  longitude: 113.914444,  stock: 419 },
];

async function main() {
  const cfg = loadConfig();
  const d = createDb(cfg.DATABASE_URL);
  await d.insert(warehouses).values(SEED).onConflictDoNothing({ target: warehouses.id });
  const count = await d.execute(sql`select count(*)::int as c from warehouses`);
  console.error('warehouses count:', count.rows[0]);
  await closePool(d);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
