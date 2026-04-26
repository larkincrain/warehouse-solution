import {
  VerifyOrderRequestSchema,
  VerifyOrderResponseSchema,
  SubmitOrderRequestSchema,
  SubmitOrderResponseSchema,
  InsufficientStockErrorSchema,
  InvalidOrderErrorSchema,
} from '@scos/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { db } from '../db/client.js';
import { warehouses } from '../db/schema.js';
import { planShipment } from '../domain/shipment-planner.js';
import { calculateOrderTotals } from '../domain/pricing.js';
import { isOrderValid } from '../domain/order-validator.js';
import { submitOrder } from '../services/order-service.js';

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

  app.post('/', {
    schema: {
      body: SubmitOrderRequestSchema,
      response: {
        201: SubmitOrderResponseSchema,
        409: InsufficientStockErrorSchema,
        422: InvalidOrderErrorSchema,
      },
    },
  }, async (req, reply) => {
    const { quantity, shippingAddress } = req.body;
    const idempotencyKey = req.headers['idempotency-key'];
    const key = typeof idempotencyKey === 'string' ? idempotencyKey : undefined;

    const order = await submitOrder({
      quantity,
      shippingLat: shippingAddress.latitude,
      shippingLng: shippingAddress.longitude,
      idempotencyKey: key,
    });

    const shipmentPlan = order.shipments.map((s) => ({
      warehouseId: s.warehouseId,
      warehouseName: s.warehouse.name,
      warehouseLatitude: s.warehouse.latitude,
      warehouseLongitude: s.warehouse.longitude,
      quantity: s.quantity,
      distanceKm: s.distanceKm,
      shippingCostCents: s.shippingCostCents,
    }));

    return reply.status(201).send({
      id: order.id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt.toISOString(),
      quantity: order.quantity,
      totalBeforeDiscountCents: order.totalBeforeDiscountCents,
      discountCents: order.discountCents,
      discountPercent: Math.round((order.discountCents / order.totalBeforeDiscountCents) * 100),
      totalAfterDiscountCents: order.totalAfterDiscountCents,
      shippingCostCents: order.shippingCostCents,
      isValid: true,
      invalidReason: null,
      shipmentPlan,
    });
  });
};
