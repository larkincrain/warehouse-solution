import { beforeAll, describe, expect, it } from 'vitest';
import { post, waitForReady } from './setup.js';

beforeAll(async () => { await waitForReady(); }, 60_000);

describe('e2e: POST /api/v1/orders/verify', () => {
  it('round-trips a valid verify request', async () => {
    const { status, body } = await post<{ isValid: boolean; shipmentPlan: unknown[]; discountPercent: number }>(
      '/api/v1/orders/verify',
      { quantity: 100, shippingAddress: { latitude: 13.7563, longitude: 100.5018 } },
    );
    expect(status).toBe(200);
    expect(body.isValid).toBe(true);
    expect(body.discountPercent).toBe(15);
    expect(body.shipmentPlan.length).toBeGreaterThan(0);
  });
});
