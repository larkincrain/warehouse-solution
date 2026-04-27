import { describe, expect, it } from 'vitest';
import { requestFingerprint } from '../../src/domain/idempotency.js';

describe('requestFingerprint', () => {
  it('is stable across calls with identical inputs', () => {
    const a = requestFingerprint({ quantity: 5, shippingLat: 13.7563, shippingLng: 100.5018 });
    const b = requestFingerprint({ quantity: 5, shippingLat: 13.7563, shippingLng: 100.5018 });
    expect(a).toBe(b);
  });

  it('differs when quantity changes', () => {
    const a = requestFingerprint({ quantity: 5, shippingLat: 13.7563, shippingLng: 100.5018 });
    const b = requestFingerprint({ quantity: 6, shippingLat: 13.7563, shippingLng: 100.5018 });
    expect(a).not.toBe(b);
  });

  it('differs when coords change above the 7-decimal rounding threshold', () => {
    const a = requestFingerprint({ quantity: 5, shippingLat: 13.7563000, shippingLng: 100.5018 });
    const b = requestFingerprint({ quantity: 5, shippingLat: 13.7563001, shippingLng: 100.5018 });
    expect(a).not.toBe(b);
  });

  it('matches when coords differ only below the rounding threshold', () => {
    // 13.75630001 rounds to 13.7563000 at 7 decimals — same fingerprint.
    const a = requestFingerprint({ quantity: 5, shippingLat: 13.7563, shippingLng: 100.5018 });
    const b = requestFingerprint({ quantity: 5, shippingLat: 13.75630001, shippingLng: 100.5018 });
    expect(a).toBe(b);
  });
});
