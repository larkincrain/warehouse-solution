import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { OrdersListResponse } from '@scos/shared';
import { startTestEnv, resetState, stopTestEnv, type TestEnv } from './setup.js';

let env: TestEnv;
beforeAll(async () => { env = await startTestEnv(); }, 60_000);
afterAll(async () => { await stopTestEnv(env); });
beforeEach(async () => { await resetState(env); });

const bangkok = { latitude: 13.7563, longitude: 100.5018 };

describe('GET /api/v1/orders', () => {
  it('returns empty list initially', async () => {
    const res = await env.app.inject({ method: 'GET', url: '/api/v1/orders' });
    expect(res.statusCode).toBe(200);
    const body = res.json<OrdersListResponse>();
    expect(body.orders).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  it('paginates newest-first via cursor', async () => {
    for (let i = 0; i < 3; i++) {
      await env.app.inject({
        method: 'POST', url: '/api/v1/orders',
        payload: { quantity: 1, shippingAddress: bangkok },
      });
    }
    const page1 = await env.app.inject({ method: 'GET', url: '/api/v1/orders?limit=2' });
    const body1 = page1.json<OrdersListResponse>();
    expect(body1.orders).toHaveLength(2);
    expect(body1.orders[0]!.createdAt >= body1.orders[1]!.createdAt).toBe(true);
    expect(body1.nextCursor).toBeTypeOf('string');

    const page2 = await env.app.inject({ method: 'GET', url: `/api/v1/orders?limit=2&cursor=${body1.nextCursor!}` });
    const body2 = page2.json<OrdersListResponse>();
    expect(body2.orders).toHaveLength(1);
    expect(body2.nextCursor).toBeNull();
  });

  it('returns empty when cursor points to oldest order (walked past end)', async () => {
    // Insert 2 orders so we have a known-last id
    const submits = [];
    for (let i = 0; i < 2; i++) {
      const r = await env.app.inject({
        method: 'POST', url: '/api/v1/orders',
        payload: { quantity: 1, shippingAddress: bangkok },
      });
      submits.push(r.json<{ id: string }>().id);
    }
    // submits[0] is the OLDEST (inserted first); using its id as cursor should return empty
    const oldestId = submits[0];
    const res = await env.app.inject({ method: 'GET', url: `/api/v1/orders?cursor=${oldestId}` });
    const body = res.json<OrdersListResponse>();
    expect(body.orders).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });
});
