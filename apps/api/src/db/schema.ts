import { pgTable, text, integer, doublePrecision, uuid, timestamp, index, check } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const warehouses = pgTable('warehouses', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  stock: integer('stock').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  stockNonNegative: check('warehouses_stock_non_negative', sql`${t.stock} >= 0`),
}));

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderNumber: uuid('order_number').notNull().unique().defaultRandom(),
  quantity: integer('quantity').notNull(),
  shippingLat: doublePrecision('shipping_lat').notNull(),
  shippingLng: doublePrecision('shipping_lng').notNull(),
  totalBeforeDiscountCents: integer('total_before_discount_cents').notNull(),
  discountCents: integer('discount_cents').notNull(),
  totalAfterDiscountCents: integer('total_after_discount_cents').notNull(),
  shippingCostCents: integer('shipping_cost_cents').notNull(),
  idempotencyKey: text('idempotency_key').unique(),
  requestFingerprint: text('request_fingerprint'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  quantityPositive: check('orders_quantity_positive', sql`${t.quantity} > 0`),
  createdAtIdx: index('orders_created_at_idx').on(t.createdAt),
}));

export const shipments = pgTable('shipments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  warehouseId: text('warehouse_id').notNull().references(() => warehouses.id),
  quantity: integer('quantity').notNull(),
  distanceKm: doublePrecision('distance_km').notNull(),
  shippingCostCents: integer('shipping_cost_cents').notNull(),
}, (t) => ({
  orderIdx: index('shipments_order_id_idx').on(t.orderId),
  quantityPositive: check('shipments_quantity_positive', sql`${t.quantity} > 0`),
}));

export const ordersRelations = relations(orders, ({ many }) => ({
  shipments: many(shipments),
}));

export const shipmentsRelations = relations(shipments, ({ one }) => ({
  order: one(orders, { fields: [shipments.orderId], references: [orders.id] }),
  warehouse: one(warehouses, { fields: [shipments.warehouseId], references: [warehouses.id] }),
}));
