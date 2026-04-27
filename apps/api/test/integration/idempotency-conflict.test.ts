import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestEnv, resetState, stopTestEnv, type TestEnv } from './setup.js';

let env: TestEnv;
beforeAll(async () => { env = await startTestEnv(); }, 60_000);
afterAll(async () => { await stopTestEnv(env); });
beforeEach(async () => { await resetState(env); });

const bangkok = { latitude: 13.7563, longitude: 100.5018 };

describe('idempotency-key conflict detection', () => {
  it('reusing a key with a different body returns 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const key = '33333333-3333-3333-3333-333333333333';

    const r1 = await env.app.inject({
      method: 'POST', url: '/api/v1/orders',
      headers: { 'idempotency-key': key },
      payload: { quantity: 10, shippingAddress: bangkok },
    });
    expect(r1.statusCode).toBe(201);

    const r2 = await env.app.inject({
      method: 'POST', url: '/api/v1/orders',
      headers: { 'idempotency-key': key },
      // Same key, different quantity → must be rejected, not silently dedup'd.
      payload: { quantity: 11, shippingAddress: bangkok },
    });
    expect(r2.statusCode).toBe(409);
    expect(r2.json<{ error: string }>().error).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('rejects a malformed (non-uuid) idempotency-key as 400', async () => {
    const r = await env.app.inject({
      method: 'POST', url: '/api/v1/orders',
      headers: { 'idempotency-key': 'not-a-uuid' },
      payload: { quantity: 5, shippingAddress: bangkok },
    });
    expect(r.statusCode).toBe(400);
  });
});
