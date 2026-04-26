import { describe, it, expect } from 'vitest';
import { isOrderValid } from '../../src/domain/order-validator.js';

describe('isOrderValid', () => {
  it('returns true when shipping is exactly 15% of total', () => {
    expect(isOrderValid(150, 1000)).toBe(true); // 15% boundary inclusive (≤)
  });
  it('returns false when shipping just exceeds 15%', () => {
    expect(isOrderValid(151, 1000)).toBe(false);
  });
  it('returns true when shipping is well under 15%', () => {
    expect(isOrderValid(50, 1000)).toBe(true);
  });
  it('returns true with zero shipping', () => {
    expect(isOrderValid(0, 1000)).toBe(true);
  });
  it('returns false with zero order amount and any shipping', () => {
    expect(isOrderValid(1, 0)).toBe(false);
  });
  it('returns true with both zero (degenerate)', () => {
    expect(isOrderValid(0, 0)).toBe(true);
  });
});
