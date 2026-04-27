import { z } from 'zod';
import {
  VerifyOrderRequestSchema,
  VerifyOrderResponseSchema,
  SubmitOrderRequestSchema,
  SubmitOrderResponseSchema,
  SubmitConflictErrorSchema,
  InvalidOrderErrorSchema,
  OrdersListQuerySchema,
  OrdersListResponseSchema,
} from '@scos/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { discountPercentForQuantity } from '../domain/pricing.js';
import type { OrderWithShipments } from '../repositories/order-repository.js';

const SubmitHeadersSchema = z.object({
  'idempotency-key': z.string().uuid().optional(),
});

export const orderRoutes: FastifyPluginAsyncZod = (app) => {

  app.post('/verify', {
    schema: {
      body: VerifyOrderRequestSchema,
      response: { 200: VerifyOrderResponseSchema },
    },
  }, async (req) => {

    const { quantity, shippingAddress } = req.body;

    const result = await req.server.services.orders.verifyOrder({
      quantity,
      shippingLat: shippingAddress.latitude,
      shippingLng: shippingAddress.longitude,
    });

    return {
      quantity,
      totalBeforeDiscountCents: result.totals.totalBeforeDiscountCents,
      discountPercent: result.totals.discountPercent,
      discountCents: result.totals.discountCents,
      totalAfterDiscountCents: result.totals.totalAfterDiscountCents,
      shippingCostCents: result.shippingCostCents,
      isValid: result.isValid,
      invalidReason: result.invalidReason,
      shipmentPlan: result.shipmentPlan,
    };
  });

  app.post('/', {
    schema: {
      body: SubmitOrderRequestSchema,
      headers: SubmitHeadersSchema,
      response: {
        201: SubmitOrderResponseSchema,
        409: SubmitConflictErrorSchema,
        422: InvalidOrderErrorSchema,
      },
    },
  }, async (req, reply) => {

    const { quantity, shippingAddress } = req.body;
    const idempotencyKey = req.headers['idempotency-key'];

    const submitInput: Parameters<typeof req.server.services.orders.submitOrder>[0] = {
      quantity,
      shippingLat: shippingAddress.latitude,
      shippingLng: shippingAddress.longitude,
    };

    if (idempotencyKey) submitInput.idempotencyKey = idempotencyKey;

    const order = await req.server.services.orders.submitOrder(submitInput);
    return reply.status(201).send(toSubmitResponse(order));
  });

  app.get('/', {
    schema: {
      querystring: OrdersListQuerySchema,
      response: { 200: OrdersListResponseSchema },
    },
  }, async (req) => {

    const listInput: Parameters<typeof req.server.services.orders.listOrders>[0] = {
      limit: req.query.limit,
    };

    if (req.query.cursor) listInput.cursor = req.query.cursor;
    const { rows, nextCursor } = await req.server.services.orders.listOrders(listInput);

    return {
      orders: rows.map(toListItem),
      nextCursor,
    };

  });

  return Promise.resolve();
};

function toSubmitResponse(order: OrderWithShipments) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt.toISOString(),
    quantity: order.quantity,
    totalBeforeDiscountCents: order.totalBeforeDiscountCents,
    discountCents: order.discountCents,
    discountPercent: discountPercentForQuantity(order.quantity),
    totalAfterDiscountCents: order.totalAfterDiscountCents,
    shippingCostCents: order.shippingCostCents,
    isValid: true,
    invalidReason: null,
    shipmentPlan: order.shipments.map(toLeg),
  };
}

function toListItem(o: OrderWithShipments) {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    quantity: o.quantity,
    shippingAddress: { latitude: o.shippingLat, longitude: o.shippingLng },
    totalBeforeDiscountCents: o.totalBeforeDiscountCents,
    discountCents: o.discountCents,
    discountPercent: discountPercentForQuantity(o.quantity),
    totalAfterDiscountCents: o.totalAfterDiscountCents,
    shippingCostCents: o.shippingCostCents,
    createdAt: o.createdAt.toISOString(),
    isValid: true,
    invalidReason: null,
    shipments: o.shipments.map(toLeg),
  };
}

function toLeg(s: OrderWithShipments['shipments'][number]) {
  return {
    warehouseId: s.warehouseId,
    warehouseName: s.warehouse.name,
    warehouseLatitude: s.warehouse.latitude,
    warehouseLongitude: s.warehouse.longitude,
    quantity: s.quantity,
    distanceKm: s.distanceKm,
    shippingCostCents: s.shippingCostCents,
  };
}
