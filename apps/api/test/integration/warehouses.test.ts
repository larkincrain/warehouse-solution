import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Warehouse } from '@scos/shared';
import { startTestEnv, resetState, stopTestEnv, type TestEnv } from './setup.js';

let env: TestEnv;
beforeAll(async () => { env = await startTestEnv(); }, 60_000);
afterAll(async () => { await stopTestEnv(env); });
beforeEach(async () => { await resetState(env); });

describe('GET /api/v1/warehouses', () => {
  it('returns all 6 with current stock', async () => {
    const res = await env.app.inject({ method: 'GET', url: '/api/v1/warehouses' });
    expect(res.statusCode).toBe(200);
    const body = res.json<Warehouse[]>();
    expect(body).toHaveLength(6);
    const ids = body.map((w) => w.id).sort();
    expect(ids).toEqual(['hong-kong', 'los-angeles', 'new-york', 'paris', 'sao-paulo', 'warsaw']);
  });

  it('reflects post-submit decrement', async () => {
    await env.app.inject({
      method: 'POST', url: '/api/v1/orders',
      payload: { quantity: 50, shippingAddress: { latitude: 13.7563, longitude: 100.5018 } },
    });
    const res = await env.app.inject({ method: 'GET', url: '/api/v1/warehouses' });
    const body = res.json<Warehouse[]>();
    const hk = body.find((w) => w.id === 'hong-kong');
    expect(hk?.stock).toBe(419 - 50);
  });
});
