import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type {
  SubmitOrderResponse,
  InsufficientStockErrorBody,
  InvalidOrderErrorBody,
} from '@scos/shared';
import { startTestEnv, resetState, stopTestEnv, type TestEnv } from './setup.js';

let env: TestEnv;
beforeAll(async () => { env = await startTestEnv(); }, 60_000);
afterAll(async () => { await stopTestEnv(env); });
beforeEach(async () => { await resetState(env); });

const bangkok = { latitude: 13.7563, longitude: 100.5018 };

describe('POST /api/v1/orders', () => {
  it('201 on success and decrements stock', async () => {
    const before = await env.db.execute(sql`select stock from warehouses where id = 'hong-kong'`);
    const beforeStock = (before.rows[0] as { stock: number }).stock;

    const res = await env.app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: { quantity: 50, shippingAddress: bangkok },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<SubmitOrderResponse>();
    expect(body.id).toBeTypeOf('string');
    expect(body.orderNumber).toBeTypeOf('string');
    expect(body.shipmentPlan[0]?.warehouseId).toBe('hong-kong');

    const after = await env.db.execute(sql`select stock from warehouses where id = 'hong-kong'`);
    expect((after.rows[0] as { stock: number }).stock).toBe(beforeStock - 50);
  });

  it('idempotency-key replay returns same order without re-decrementing stock', async () => {
    const key = '11111111-1111-1111-1111-111111111111';
    const r1 = await env.app.inject({
      method: 'POST', url: '/api/v1/orders',
      headers: { 'idempotency-key': key },
      payload: { quantity: 30, shippingAddress: bangkok },
    });
    expect(r1.statusCode).toBe(201);
    const before = await env.db.execute(sql`select stock from warehouses where id = 'hong-kong'`);
    const stockAfterFirst = (before.rows[0] as { stock: number }).stock;

    const r2 = await env.app.inject({
      method: 'POST', url: '/api/v1/orders',
      headers: { 'idempotency-key': key },
      payload: { quantity: 30, shippingAddress: bangkok },
    });
    expect(r2.statusCode).toBe(201);
    expect(r2.json<SubmitOrderResponse>().id).toBe(r1.json<SubmitOrderResponse>().id);

    const after = await env.db.execute(sql`select stock from warehouses where id = 'hong-kong'`);
    expect((after.rows[0] as { stock: number }).stock).toBe(stockAfterFirst);
  });

  it('422 when shipping > 15% of total', async () => {
    const res = await env.app.inject({
      method: 'POST', url: '/api/v1/orders',
      payload: { quantity: 1, shippingAddress: { latitude: -77.85, longitude: 166.67 } }, // McMurdo
    });
    expect(res.statusCode).toBe(422);
    expect(res.json<InvalidOrderErrorBody>().error).toBe('INVALID_ORDER');
  });

  it('409 with stock snapshot when quantity exceeds total stock', async () => {
    const res = await env.app.inject({
      method: 'POST', url: '/api/v1/orders',
      payload: { quantity: 100_000, shippingAddress: bangkok },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json<InsufficientStockErrorBody>();
    expect(body.error).toBe('INSUFFICIENT_STOCK');
    expect(Array.isArray(body.availableStock)).toBe(true);
    expect(body.availableStock.length).toBe(6);
  });
});
