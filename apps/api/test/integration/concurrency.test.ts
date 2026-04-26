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

      const win = (fulfilled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof submitOrder>>>).value;
      const wonUnits = win.shipments.reduce((s, x) => s + x.quantity, 0);
      expect(wonUnits).toBe(100);

      const stockRow = await env.db.execute(sql`select stock from warehouses where id = 'hong-kong'`);
      expect((stockRow.rows[0] as { stock: number }).stock).toBe(0);

      const orderCount = await env.db.execute(sql`select count(*)::int as n from orders`);
      expect((orderCount.rows[0] as { n: number }).n).toBe(1);
    }
  }, 60_000);
});

describe('concurrent submitOrder with same idempotency key', () => {
  beforeEach(async () => {
    await resetState(env);
  });

  it('two parallel calls with same idempotency-key resolve to same order; stock decremented once', async () => {
    const key = '22222222-2222-2222-2222-222222222222';
    const before = await env.db.execute(sql`select stock from warehouses where id = 'hong-kong'`);
    const beforeStock = (before.rows[0] as { stock: number }).stock;

    const order = {
      quantity: 25,
      shippingLat: 13.7563,
      shippingLng: 100.5018,
      idempotencyKey: key,
    };

    // Loop a few iterations to make the race likely
    for (let i = 0; i < 5; i++) {
      // Reset between iterations
      await env.db.execute(sql`UPDATE warehouses SET stock = ${beforeStock} WHERE id = 'hong-kong'`);
      await env.db.execute(sql`TRUNCATE TABLE shipments, orders RESTART IDENTITY CASCADE`);

      const results = await Promise.allSettled([submitOrder(order), submitOrder(order)]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof submitOrder>>>[];
      const rejected = results.filter((r) => r.status === 'rejected');

      // Both should fulfill (no rejection — the loser re-reads)
      expect(fulfilled).toHaveLength(2);
      expect(rejected).toHaveLength(0);

      // Both should return the same order id
      expect(fulfilled[0]!.value.id).toBe(fulfilled[1]!.value.id);

      // Exactly ONE order row exists in the table (no double-insert)
      const countRes = await env.db.execute(sql`select count(*)::int as n from orders`);
      expect((countRes.rows[0] as { n: number }).n).toBe(1);

      // Stock decremented exactly once (not twice)
      const after = await env.db.execute(sql`select stock from warehouses where id = 'hong-kong'`);
      expect((after.rows[0] as { stock: number }).stock).toBe(beforeStock - 25);
    }
  }, 60_000);
});
