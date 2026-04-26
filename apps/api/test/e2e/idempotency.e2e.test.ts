import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { post, waitForReady } from './setup.js';

beforeAll(async () => { await waitForReady(); }, 60_000);

describe('e2e: idempotency-key', () => {
  it('two POSTs with same key yield the same id', async () => {
    const key = randomUUID();
    const payload = { quantity: 5, shippingAddress: { latitude: 13.7563, longitude: 100.5018 } };
    const r1 = await post<{ id: string }>('/api/v1/orders', payload, { 'idempotency-key': key });
    const r2 = await post<{ id: string }>('/api/v1/orders', payload, { 'idempotency-key': key });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r2.body.id).toBe(r1.body.id);
  });

  it('different key creates a different order', async () => {
    const payload = { quantity: 5, shippingAddress: { latitude: 13.7563, longitude: 100.5018 } };
    const r1 = await post<{ id: string }>('/api/v1/orders', payload, { 'idempotency-key': randomUUID() });
    const r2 = await post<{ id: string }>('/api/v1/orders', payload, { 'idempotency-key': randomUUID() });
    expect(r2.body.id).not.toBe(r1.body.id);
  });
});
