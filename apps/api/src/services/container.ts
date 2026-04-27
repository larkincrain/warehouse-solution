import type { FastifyInstance } from 'fastify';
import { createOrderRepository } from '../repositories/order-repository.js';
import { createWarehouseRepository } from '../repositories/warehouse-repository.js';
import { createOrderService, type OrderService } from './order-service.js';
import { createWarehouseService, type WarehouseService } from './warehouse-service.js';

declare module 'fastify' {
  interface FastifyInstance {
    services: { orders: OrderService; warehouses: WarehouseService };
  }
}

export interface ContainerOptions {
  txMaxRetries: number;
}

/**
 * Wires repositories + services on top of the already-decorated `app.db`.
 * Routes only read `req.server.services.*` — they never see drizzle directly.
 */
export function registerServices(app: FastifyInstance, opts: ContainerOptions): void {
  
  const orderRepo = createOrderRepository(app.db);
  const warehouseRepo = createWarehouseRepository(app.db);

  const orders = createOrderService({
    db: app.db,
    orders: orderRepo,
    warehouses: warehouseRepo,
    logger: app.log,
    txMaxRetries: opts.txMaxRetries,
  });
  const warehouses = createWarehouseService({ warehouses: warehouseRepo });

  app.decorate('services', { orders, warehouses });
}
