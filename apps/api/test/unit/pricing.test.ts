import { describe, it, expect } from 'vitest';
import { calculateOrderTotals, discountPercentForQuantity, UNIT_PRICE_CENTS, UNIT_WEIGHT_KG } from '../../src/domain/pricing.js';

describe('discountPercentForQuantity', () => {
  it.each([
    [1, 0],
    [24, 0],
    [25, 5],
    [49, 5],
    [50, 10],
    [99, 10],
    [100, 15],
    [249, 15],
    [250, 20],
    [1000, 20],
  ])('quantity %i → %i%%', (q, pct) => {
    expect(discountPercentForQuantity(q)).toBe(pct);
  });
});

describe('calculateOrderTotals', () => {
  it('150 units → $22500 / 15% / $19125', () => {
    const t = calculateOrderTotals(150);
    expect(t.totalBeforeDiscountCents).toBe(2_250_000);
    expect(t.discountPercent).toBe(15);
    expect(t.discountCents).toBe(337_500);
    expect(t.totalAfterDiscountCents).toBe(1_912_500);
  });

  it('1 unit → no discount', () => {
    const t = calculateOrderTotals(1);
    expect(t.totalBeforeDiscountCents).toBe(15_000);
    expect(t.discountCents).toBe(0);
    expect(t.totalAfterDiscountCents).toBe(15_000);
  });

  it('250 units → 20% discount', () => {
    const t = calculateOrderTotals(250);
    expect(t.totalBeforeDiscountCents).toBe(3_750_000);
    expect(t.discountCents).toBe(750_000);
    expect(t.totalAfterDiscountCents).toBe(3_000_000);
  });

  it('all values are integer cents', () => {
    const t = calculateOrderTotals(37);
    expect(Number.isInteger(t.totalBeforeDiscountCents)).toBe(true);
    expect(Number.isInteger(t.discountCents)).toBe(true);
    expect(Number.isInteger(t.totalAfterDiscountCents)).toBe(true);
  });
});

describe('product constants', () => {
  it('UNIT_PRICE_CENTS = 15000', () => expect(UNIT_PRICE_CENTS).toBe(15_000));
  it('UNIT_WEIGHT_KG = 0.365', () => expect(UNIT_WEIGHT_KG).toBe(0.365));
});
