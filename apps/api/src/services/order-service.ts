import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { warehouses, orders, shipments } from '../db/schema.js';
import { planShipment } from '../domain/shipment-planner.js';
import { calculateOrderTotals } from '../domain/pricing.js';
import { isOrderValid } from '../domain/order-validator.js';
import { InsufficientStockError, InvalidOrderError, IdempotencyReplayError, isUniqueViolation } from '../errors.js';

export interface SubmitInput {
  quantity: number;
  shippingLat: number;
  shippingLng: number;
  idempotencyKey?: string;
}

export async function submitOrder(input: SubmitInput) {
  const d = db();

  if (input.idempotencyKey) {
    const existing = await d.query.orders.findFirst({
      where: eq(orders.idempotencyKey, input.idempotencyKey),
      with: { shipments: { with: { warehouse: true } } },
    });
    if (existing) return existing;
  }

  try {
    // read committed is sufficient: explicit row locks via .for('update') above
    // give serializable behavior on the warehouse rows we mutate.
    return await d.transaction(async (tx) => {
      const lockedWarehouses = await tx
        .select()
        .from(warehouses)
        .orderBy(asc(warehouses.id))
        .for('update');

      const plan = planShipment(
        input.quantity,
        { lat: input.shippingLat, lng: input.shippingLng },
        lockedWarehouses,
      );

      if (!plan.feasible) {
        throw new InsufficientStockError(
          lockedWarehouses.map((w) => ({ warehouseId: w.id, stock: w.stock })),
        );
      }

      const totals = calculateOrderTotals(input.quantity);
      if (!isOrderValid(plan.shippingCostCents, totals.totalAfterDiscountCents)) {
        throw new InvalidOrderError('Shipping cost exceeds 15% of order total');
      }

      for (const leg of plan.legs) {
        await tx
          .update(warehouses)
          .set({ stock: sql`${warehouses.stock} - ${leg.quantity}` })
          .where(eq(warehouses.id, leg.warehouseId));
      }

      let created;
      try {
        [created] = await tx.insert(orders).values({
          quantity: input.quantity,
          shippingLat: input.shippingLat,
          shippingLng: input.shippingLng,
          totalBeforeDiscountCents: totals.totalBeforeDiscountCents,
          discountCents: totals.discountCents,
          totalAfterDiscountCents: totals.totalAfterDiscountCents,
          shippingCostCents: plan.shippingCostCents,
          idempotencyKey: input.idempotencyKey,
        }).returning();
      } catch (e) {
        if (input.idempotencyKey && isUniqueViolation(e, 'orders_idempotency_key_unique')) {
          // Concurrent submit won the race. Bail out of the tx; outer code re-reads.
          throw new IdempotencyReplayError(input.idempotencyKey);
        }
        throw e;
      }

      /* c8 ignore start -- defensive: RETURNING from INSERT cannot legitimately yield zero rows */
      if (!created) {
        throw new Error(
          `order insert returned no row (qty=${input.quantity}, lat=${input.shippingLat}, lng=${input.shippingLng})`,
        );
      }
      /* c8 ignore stop */

      await tx.insert(shipments).values(
        plan.legs.map((leg) => ({
          orderId: created.id,
          warehouseId: leg.warehouseId,
          quantity: leg.quantity,
          distanceKm: leg.distanceKm,
          shippingCostCents: leg.shippingCostCents,
        })),
      );

      const fresh = await tx.query.orders.findFirst({
        where: eq(orders.id, created.id),
        with: { shipments: { with: { warehouse: true } } },
      });
      /* c8 ignore start -- defensive: just-inserted row cannot fail to re-read in same tx */
      if (!fresh) throw new Error('failed to re-read created order');
      /* c8 ignore stop */
      return fresh;
    }, { isolationLevel: 'read committed' });
  } catch (e) {
    if (e instanceof IdempotencyReplayError) {
      const existing = await d.query.orders.findFirst({
        where: eq(orders.idempotencyKey, e.idempotencyKey),
        with: { shipments: { with: { warehouse: true } } },
      });
      if (!existing) {
        // The other tx aborted between our race-loss and our re-read. Re-throw.
        throw e;
      }
      return existing;
    }
    throw e;
  }
}
