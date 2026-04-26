import {
  VerifyOrderRequestSchema,
  VerifyOrderResponseSchema,
} from '@scos/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { db } from '../db/client.js';
import { warehouses } from '../db/schema.js';
import { planShipment } from '../domain/shipment-planner.js';
import { calculateOrderTotals } from '../domain/pricing.js';
import { isOrderValid } from '../domain/order-validator.js';

// eslint-disable-next-line @typescript-eslint/require-await
export const orderRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post('/verify', {
    schema: {
      body: VerifyOrderRequestSchema,
      response: { 200: VerifyOrderResponseSchema },
    },
  }, async (req) => {
    const { quantity, shippingAddress } = req.body;

    const ws = await db().select().from(warehouses);
    const plan = planShipment(quantity, { lat: shippingAddress.latitude, lng: shippingAddress.longitude }, ws);
    const totals = calculateOrderTotals(quantity);

    let isValid = plan.feasible;
    let invalidReason: string | null = null;
    if (!plan.feasible) {
      invalidReason = 'Insufficient stock across all warehouses';
    } else if (!isOrderValid(plan.shippingCostCents, totals.totalAfterDiscountCents)) {
      isValid = false;
      invalidReason = 'Shipping cost exceeds 15% of order total';
    }

    return {
      quantity,
      totalBeforeDiscountCents: totals.totalBeforeDiscountCents,
      discountPercent: totals.discountPercent,
      discountCents: totals.discountCents,
      totalAfterDiscountCents: totals.totalAfterDiscountCents,
      shippingCostCents: plan.shippingCostCents,
      isValid,
      invalidReason,
      shipmentPlan: plan.legs,
    };
  });
};
