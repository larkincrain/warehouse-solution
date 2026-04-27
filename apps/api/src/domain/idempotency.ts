import { createHash } from 'node:crypto';

export interface FingerprintInput {
  quantity: number;
  shippingLat: number;
  shippingLng: number;
}

/**
 * Stable hash of the inputs that define an order. Used to detect when a client
 * reuses an idempotency-key with a different request body — a programming
 * error we surface as 409 instead of silently returning the original order.
 *
 * Float coords are normalized to 7 decimals (~1cm at the equator). Anything
 * finer is below GPS precision and would create spurious mismatches.
 */
export function requestFingerprint(input: FingerprintInput): string {
  const canonical = JSON.stringify({
    q: input.quantity,
    lat: roundCoord(input.shippingLat),
    lng: roundCoord(input.shippingLng),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function roundCoord(n: number): number {
  return Math.round(n * 1e7) / 1e7;
}
