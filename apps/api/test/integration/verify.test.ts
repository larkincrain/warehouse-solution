import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { VerifyOrderResponse } from '@scos/shared';
import { startTestEnv, resetState, stopTestEnv, type TestEnv } from './setup.js';

let env: TestEnv;

beforeAll(async () => { env = await startTestEnv(); }, 60_000);
afterAll(async () => { await stopTestEnv(env); });
beforeEach(async () => { await resetState(env); });

describe('POST /api/v1/orders/verify', () => {
  it('returns valid plan for an in-budget order', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/v1/orders/verify',
      payload: { quantity: 150, shippingAddress: { latitude: 13.7563, longitude: 100.5018 } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<VerifyOrderResponse>();
    expect(body.isValid).toBe(true);
    expect(body.invalidReason).toBeNull();
    expect(body.discountPercent).toBe(15);
    expect(body.totalBeforeDiscountCents).toBe(2_250_000); // 150 * $150.00
    expect(body.discountCents).toBe(337_500);              // 15% of 2_250_000
    expect(body.totalAfterDiscountCents).toBe(1_912_500);
    expect(body.shipmentPlan.length).toBeGreaterThan(0);
    expect(body.shipmentPlan.reduce((s, l) => s + l.quantity, 0)).toBe(150);
  });

  it('returns isValid:false with partial plan when stock insufficient', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/v1/orders/verify',
      payload: { quantity: 100_000, shippingAddress: { latitude: 13.7563, longitude: 100.5018 } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<VerifyOrderResponse>();
    expect(body.isValid).toBe(false);
    expect(body.invalidReason).toBe('Insufficient stock across all warehouses');
    expect(body.shipmentPlan.length).toBeGreaterThan(0);
  });

  it('returns isValid:false when shipping > 15% of total', async () => {
    // 1 unit shipped to Antarctica (McMurdo Station) — every warehouse is
    // >6000 km away, so per-unit shipping ($150 × 15% = $22.50 budget) is
    // exceeded easily even though the order subtotal is only $150.
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/v1/orders/verify',
      payload: { quantity: 1, shippingAddress: { latitude: -77.85, longitude: 166.67 } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<VerifyOrderResponse>();
    expect(body.isValid).toBe(false);
    expect(body.invalidReason).toBe('Shipping cost exceeds 15% of order total');
    expect(body.shipmentPlan.length).toBeGreaterThan(0);
  });

  it('400s on invalid input', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/v1/orders/verify',
      payload: { quantity: -5, shippingAddress: { latitude: 0, longitude: 0 } },
    });
    expect(res.statusCode).toBe(400);
  });
});
