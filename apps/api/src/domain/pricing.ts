import { bankersRound } from './rounding.js';

export const UNIT_PRICE_CENTS = 15_000; // $150.00
export const UNIT_WEIGHT_KG = 0.365;

export interface OrderTotals {
  totalBeforeDiscountCents: number;
  discountPercent: number;
  discountCents: number;
  totalAfterDiscountCents: number;
}

/**
 * Returns the discount percentage (0/5/10/15/20) for a given order quantity.
 * Highest tier reached, not stacked.
 */
export function discountPercentForQuantity(quantity: number): number {
  if (quantity >= 250) return 20;
  if (quantity >= 100) return 15;
  if (quantity >= 50) return 10;
  if (quantity >= 25) return 5;
  return 0;
}

/**
 * Calculate subtotal, discount, and total-after-discount for an order quantity.
 * All values are integer cents (banker's rounded).
 */
export function calculateOrderTotals(quantity: number): OrderTotals {
  
  const totalBeforeDiscountCents = quantity * UNIT_PRICE_CENTS;
  const discountPercent = discountPercentForQuantity(quantity);
  const discountCents = bankersRound((totalBeforeDiscountCents * discountPercent) / 100);
  const totalAfterDiscountCents = totalBeforeDiscountCents - discountCents;

  return { totalBeforeDiscountCents, discountPercent, discountCents, totalAfterDiscountCents };
}
