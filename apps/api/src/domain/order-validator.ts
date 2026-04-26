/**
 * An order is valid if shipping cost is at most 15% of the discounted total.
 * Both inputs are integer cents.
 */
export function isOrderValid(shippingCostCents: number, totalAfterDiscountCents: number): boolean {
  // shipping <= 0.15 * total  ⇔  100 * shipping <= 15 * total  (integer math, no floats)
  return 100 * shippingCostCents <= 15 * totalAfterDiscountCents;
}
