import { describe, expect, it, vi } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import { createOrderService } from '../../src/services/order-service.js';
import type { Db } from '../../src/db/client.js';
import type {
  OrderRepository,
  OrderWithShipments,
} from '../../src/repositories/order-repository.js';
import type { WarehouseRepository } from '../../src/repositories/warehouse-repository.js';

function makeLogger() {
  const logger: Partial<FastifyBaseLogger> = {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  };
  return logger as FastifyBaseLogger;
}

const hongKong = { id: 'hong-kong', name: 'Hong Kong', latitude: 22.3193, longitude: 114.1694, stock: 1000, updatedAt: new Date() };

function makeWarehouseRepo(): WarehouseRepository {
  return {
    listAll: vi.fn().mockResolvedValue([hongKong]),
    lockAllForUpdate: vi.fn().mockResolvedValue([hongKong]),
    decrementStock: vi.fn().mockResolvedValue(undefined),
  };
}

const fakeOrder: OrderWithShipments = {
  id: '00000000-0000-0000-0000-000000000001',
  orderNumber: '00000000-0000-0000-0000-0000000000aa',
  quantity: 10,
  shippingLat: 13.7563,
  shippingLng: 100.5018,
  totalBeforeDiscountCents: 1000,
  discountCents: 0,
  totalAfterDiscountCents: 1000,
  shippingCostCents: 50,
  idempotencyKey: null,
  requestFingerprint: null,
  createdAt: new Date(),
  shipments: [],
};

class PgError extends Error {
  constructor(public code: string) { super(`pg ${code}`); }
}

describe('OrderService.submitOrder (unit, mocked deps)', () => {
  it('logs a warn via onRetry when the transaction throws a transient error, then succeeds', async () => {
    const logger = makeLogger();
    const warn = logger.warn as ReturnType<typeof vi.fn>;

    let txCalls = 0;
    const transaction = vi.fn(async () => {
      txCalls += 1;
      if (txCalls === 1) throw new PgError('40001');
      return { kind: 'ok' as const, order: fakeOrder };
    });
    const db = { transaction } as unknown as Db;

    const orderRepo: OrderRepository = {
      findByIdempotencyKey: vi.fn(),
      findById: vi.fn(),
      insertIfFresh: vi.fn(),
      insertShipments: vi.fn(),
      findByIdInTx: vi.fn(),
      listPaginated: vi.fn(),
    };

    const service = createOrderService({
      db,
      orders: orderRepo,
      warehouses: makeWarehouseRepo(),
      logger,
      txMaxRetries: 2,
    });

    const result = await service.submitOrder({
      quantity: 10,
      shippingLat: 13.7563,
      shippingLng: 100.5018,
    });

    expect(result).toBe(fakeOrder);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1, delayMs: expect.any(Number) }),
      'submitOrder retry on transient db error',
    );
  });

  it('throws a defensive error when the tx returns a conflict but no idempotency-key was supplied', async () => {
    const transaction = vi.fn(async () => ({ kind: 'conflict' as const }));
    const db = { transaction } as unknown as Db;

    const orderRepo: OrderRepository = {
      findByIdempotencyKey: vi.fn(),
      findById: vi.fn(),
      insertIfFresh: vi.fn(),
      insertShipments: vi.fn(),
      findByIdInTx: vi.fn(),
      listPaginated: vi.fn(),
    };

    const service = createOrderService({
      db,
      orders: orderRepo,
      warehouses: makeWarehouseRepo(),
      logger: makeLogger(),
      txMaxRetries: 0,
    });

    await expect(
      service.submitOrder({ quantity: 10, shippingLat: 13.7563, shippingLng: 100.5018 }),
    ).rejects.toThrow('insert returned no row but no idempotency key was supplied');
  });
});
