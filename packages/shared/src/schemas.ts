import { z } from 'zod';

export const ShippingAddressSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const VerifyOrderRequestSchema = z.object({
  quantity: z.number().int().positive(),
  shippingAddress: ShippingAddressSchema,
});

export const ShipmentLegSchema = z.object({
  warehouseId: z.string(),
  warehouseName: z.string(),
  warehouseLatitude: z.number(),
  warehouseLongitude: z.number(),
  quantity: z.number().int().positive(),
  distanceKm: z.number().nonnegative(),
  shippingCostCents: z.number().int().nonnegative(),
});

export const VerifyOrderResponseSchema = z.object({
  quantity: z.number().int().positive(),
  totalBeforeDiscountCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  discountPercent: z.number().int().min(0).max(20),
  totalAfterDiscountCents: z.number().int().nonnegative(),
  shippingCostCents: z.number().int().nonnegative(),
  isValid: z.boolean(),
  invalidReason: z.string().nullable(),
  shipmentPlan: z.array(ShipmentLegSchema),
});

export const SubmitOrderRequestSchema = VerifyOrderRequestSchema;

export const SubmitOrderResponseSchema = VerifyOrderResponseSchema.extend({
  id: z.string().uuid(),
  orderNumber: z.string().uuid(),
  createdAt: z.string().datetime(),
});

export const InsufficientStockErrorSchema = z.object({
  error: z.literal('INSUFFICIENT_STOCK'),
  message: z.string(),
  availableStock: z.array(z.object({
    warehouseId: z.string(),
    stock: z.number().int().nonnegative(),
  })),
});

export const IdempotencyKeyConflictErrorSchema = z.object({
  error: z.literal('IDEMPOTENCY_KEY_REUSED'),
  message: z.string(),
});

export const SubmitConflictErrorSchema = z.discriminatedUnion('error', [
  InsufficientStockErrorSchema,
  IdempotencyKeyConflictErrorSchema,
]);

export const InvalidOrderErrorSchema = z.object({
  error: z.literal('INVALID_ORDER'),
  message: z.string(),
});

export const WarehouseSchema = z.object({
  id: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  stock: z.number().int().nonnegative(),
});

export const WarehousesResponseSchema = z.array(WarehouseSchema);

export const OrderSummarySchema = SubmitOrderResponseSchema.extend({
  shippingAddress: ShippingAddressSchema,
  shipments: z.array(ShipmentLegSchema),
}).omit({ shipmentPlan: true });

export const OrdersListResponseSchema = z.object({
  orders: z.array(OrderSummarySchema),
  nextCursor: z.string().nullable(),
});

export const OrdersListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  cursor: z.string().uuid().optional(),
});

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
});

export const ReadyResponseSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
});
