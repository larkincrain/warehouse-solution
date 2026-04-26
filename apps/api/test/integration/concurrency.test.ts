import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { startTestEnv, resetState, stopTestEnv, type TestEnv } from './setup.js';
import { submitOrder } from '../../src/services/order-service.js';
import { InsufficientStockError } from '../../src/errors.js';

let env: TestEnv;
beforeAll(async () => { env = await startTestEnv(); }, 60_000);
afterAll(async () => { await stopTestEnv(env); });

const bangkok = { latitude: 13.7563, longitude: 100.5018 };

const ITERATIONS = Number(process.env.CONCURRENCY_ITERATIONS ?? 10);

describe('concurrent submitOrder', () => {
  beforeEach(async () => {
    await resetState(env);
    // Reduce stock so exactly one of two parallel orders for the global stock can succeed.
    await env.db.execute(sql`UPDATE warehouses SET stock = 0 WHERE id <> 'hong-kong'`);
    await env.db.execute(sql`UPDATE warehouses SET stock = 100 WHERE id = 'hong-kong'`);
  });

  it(`exactly one of two parallel orders succeeds (×${ITERATIONS})`, async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      await env.db.execute(sql`UPDATE warehouses SET stock = 100 WHERE id = 'hong-kong'`);
      await env.db.execute(sql`TRUNCATE TABLE shipments, orders RESTART IDENTITY CASCADE`);

      const order = { quantity: 100, shippingLat: bangkok.latitude, shippingLng: bangkok.longitude };
      const results = await Promise.allSettled([submitOrder(order), submitOrder(order)]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const reject = rejected[0] as PromiseRejectedResult;
      expect(reject.reason).toBeInstanceOf(InsufficientStockError);

      const stockRow = await env.db.execute(sql`select stock from warehouses where id = 'hong-kong'`);
      expect((stockRow.rows[0] as { stock: number }).stock).toBe(0);
    }
  }, 60_000);
});
