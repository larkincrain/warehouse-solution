import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { closePool, createDb, type Db } from '../../src/db/client.js';
import { warehouses } from '../../src/db/schema.js';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, '../../drizzle');

const SEED = [
  { id: 'los-angeles', name: 'Los Angeles', latitude: 33.9425,    longitude: -118.408056, stock: 355 },
  { id: 'new-york',    name: 'New York',    latitude: 40.639722,  longitude: -73.778889,  stock: 578 },
  { id: 'sao-paulo',   name: 'São Paulo',   latitude: -23.435556, longitude: -46.473056,  stock: 265 },
  { id: 'paris',       name: 'Paris',       latitude: 49.009722,  longitude: 2.547778,    stock: 694 },
  { id: 'warsaw',      name: 'Warsaw',      latitude: 52.165833,  longitude: 20.967222,   stock: 245 },
  { id: 'hong-kong',   name: 'Hong Kong',   latitude: 22.308889,  longitude: 113.914444,  stock: 419 },
];

export interface TestEnv {
  app: FastifyInstance;
  db: Db;
  container: StartedPostgreSqlContainer;
}

export async function startTestEnv(): Promise<TestEnv> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('scos').withUsername('scos').withPassword('scos').start();
  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;
  const d = createDb(url);
  await d.execute(sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
  await migrate(d, { migrationsFolder });
  await d.insert(warehouses).values(SEED).onConflictDoNothing({ target: warehouses.id });
  // Pass the test-owned db into the app so the app does not open a second pool.
  const app = await buildApp({ logLevel: 'silent', db: d });
  return { app, db: d, container };
}

export async function resetState(env: TestEnv): Promise<void> {
  await env.db.execute(sql`TRUNCATE TABLE shipments, orders RESTART IDENTITY CASCADE`);
  await env.db.execute(sql`UPDATE warehouses SET stock = s.stock FROM (VALUES
    ('los-angeles', 355), ('new-york', 578), ('sao-paulo', 265),
    ('paris', 694), ('warsaw', 245), ('hong-kong', 419)
  ) AS s(id, stock) WHERE warehouses.id = s.id`);
}

export async function stopTestEnv(env: TestEnv): Promise<void> {
  await env.app.close();
  await closePool(env.db);
  await env.container.stop();
}
