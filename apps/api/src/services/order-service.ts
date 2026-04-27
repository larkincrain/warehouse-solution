import { eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/client.js';
import { orders } from '../db/schema.js';
import { withTxRetry } from '../db/retry.js';
import { planShipment } from '../domain/shipment-planner.js';
import { calculateOrderTotals } from '../domain/pricing.js';
import { isOrderValid } from '../domain/order-validator.js';
import { requestFingerprint } from '../domain/idempotency.js';
import {
  IdempotencyKeyConflictError,
  InsufficientStockError,
  InvalidOrderError,
} from '../errors.js';
import type { OrderRepository, OrderWithShipments } from '../repositories/order-repository.js';
import type { WarehouseRepository } from '../repositories/warehouse-repository.js';

export interface SubmitInput {
  quantity: number;
  shippingLat: number;
  shippingLng: number;
  idempotencyKey?: string;
}

export interface VerifyInput {
  quantity: number;
  shippingLat: number;
  shippingLng: number;
}

export interface VerifyResult {
  totals: ReturnType<typeof calculateOrderTotals>;
  shippingCostCents: number;
  isValid: boolean;
  invalidReason: string | null;
  shipmentPlan: ReturnType<typeof planShipment>['legs'];
}

export interface ListOrdersInput {
  limit: number;
  cursor?: string;
}

export interface ListOrdersResult {
  rows: OrderWithShipments[];
  nextCursor: string | null;
}

export interface OrderServiceDeps {
  db: Db;
  orders: OrderRepository;
  warehouses: WarehouseRepository;
  logger: FastifyBaseLogger;
  txMaxRetries: number;
}

export function createOrderService(deps: OrderServiceDeps) {
  const { db, orders: orderRepo, warehouses: warehouseRepo, logger, txMaxRetries } = deps;

  async function verifyOrder(input: VerifyInput): Promise<VerifyResult> {

    const warehouses = await warehouseRepo.listAll();
    const plan = planShipment(
      input.quantity,
      { 
        lat: input.shippingLat, 
        lng: input.shippingLng 
      },
      warehouses,
    );
    const totals = calculateOrderTotals(input.quantity);

    let isValid = plan.feasible;
    let invalidReason: string | null = null;

    if (!plan.feasible) {
      invalidReason = 'Insufficient stock across all warehouses';
    } else if (!isOrderValid(plan.shippingCostCents, totals.totalAfterDiscountCents)) {
      isValid = false;
      invalidReason = 'Shipping cost exceeds 15% of order total';
    }

    return { 
      totals, 
      shippingCostCents: plan.shippingCostCents, 
      isValid, 
      invalidReason, 
      shipmentPlan: plan.legs 
    };
  }

  async function submitOrder(input: SubmitInput): Promise<OrderWithShipments> {
    const fingerprint = requestFingerprint(input);

    // check if the idempotency key was already used by a completed order with a matching fingerprint, and return that order if so
    if (input.idempotencyKey) {
      const existing = await orderRepo.findByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        assertFingerprintMatch(existing, fingerprint);
        return existing;
      }
    }

    return withTxRetry(
      () => runSubmit(input, fingerprint),
      {
        maxRetries: txMaxRetries,
        onRetry: (attempt, err, delayMs) => {
          logger.warn({ err, attempt, delayMs }, 'submitOrder retry on transient db error');
        },
      },
    );
  }

  async function runSubmit(input: SubmitInput, fingerprint: string): Promise<OrderWithShipments> {

    const result = await db.transaction(
      async (tx) => {
        const lockedWarehouses = await warehouseRepo.lockAllForUpdate(tx);

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

        const created = await orderRepo.insertIfFresh(tx, {
          quantity: input.quantity,
          shippingLat: input.shippingLat,
          shippingLng: input.shippingLng,
          totalBeforeDiscountCents: totals.totalBeforeDiscountCents,
          discountCents: totals.discountCents,
          totalAfterDiscountCents: totals.totalAfterDiscountCents,
          shippingCostCents: plan.shippingCostCents,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: fingerprint,
        });

        // Idempotency-key collided with an in-flight winner. Bail out of this
        // tx (rolls back the locks) so we can re-read the winner outside.
        if (!created) return { kind: 'conflict' as const };

        // after the transaction has been committed, then we decrement the stock in each warehouse. 
        // This is because the shipment plan is based on the stock levels at the time of the order creation, 
        // and we want to avoid a scenario where we create an order based on available stock but then fail to decrement it due to a transaction conflict. 
        // By doing this after the order is created, we ensure that we only decrement stock for orders that have been successfully created, 
        // and we can handle any conflicts that arise from concurrent stock decrements separately.
        for (const leg of plan.legs) {
          await warehouseRepo.decrementStock(tx, leg.warehouseId, leg.quantity);
        }

        await orderRepo.insertShipments(
          tx,
          plan.legs.map((leg) => ({
            orderId: created.id,
            warehouseId: leg.warehouseId,
            quantity: leg.quantity,
            distanceKm: leg.distanceKm,
            shippingCostCents: leg.shippingCostCents,
          })),
        );

        const fresh = await orderRepo.findByIdInTx(tx, created.id);

        if (!fresh) throw new Error('failed to re-read created order');
        return { 
          kind: 'ok' as const, 
          order: fresh 
        };
      },
      { isolationLevel: 'read committed' },
    );

    if (result.kind === 'ok') return result.order;

    if (!input.idempotencyKey) {
      throw new Error('insert returned no row but no idempotency key was supplied');
    }

    const existing = await orderRepo.findByIdempotencyKey(input.idempotencyKey);
    if (!existing) throw new Error('idempotency-key conflict but no existing order found');

    assertFingerprintMatch(existing, requestFingerprint(input));
    return existing;
  }

  async function listOrders(input: ListOrdersInput): Promise<ListOrdersResult> {

    let cursorRow: { createdAt: Date; id: string } | undefined;

    if (input.cursor) {
      const row = await db.query.orders.findFirst({
        where: eq(orders.id, input.cursor),
        columns: { 
          createdAt: true, 
          id: true 
        },
      });

      if (!row) return { rows: [], nextCursor: null };
      cursorRow = row;
    }

    const overshoot = await orderRepo.listPaginated({
      limit: input.limit + 1,
      ...(cursorRow ? { cursor: cursorRow } : {}),
    });

    const hasMore = overshoot.length > input.limit;
    const page = hasMore ? overshoot.slice(0, input.limit) : overshoot;
    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;
    
    return { rows: page, nextCursor };
  }

  return { verifyOrder, submitOrder, listOrders };
}

export type OrderService = ReturnType<typeof createOrderService>;

function assertFingerprintMatch(existing: OrderWithShipments, incoming: string): void {
  if (!existing.requestFingerprint) return;
  if (existing.requestFingerprint !== incoming) {
    throw new IdempotencyKeyConflictError();
  }
}
