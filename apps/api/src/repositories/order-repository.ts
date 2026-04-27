import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { orders, shipments } from '../db/schema.js';
import type { Querier } from './warehouse-repository.js';

export type OrderRow = typeof orders.$inferSelect;
type OrderInsert = typeof orders.$inferInsert;
type ShipmentInsert = typeof shipments.$inferInsert;

export interface OrderWithShipments extends OrderRow {
  shipments: Array<typeof shipments.$inferSelect & {
    warehouse: { id: string; name: string; latitude: number; longitude: number };
  }>;
}

export function createOrderRepository(db: Db) {
  return {
    findByIdempotencyKey: (key: string): Promise<OrderWithShipments | undefined> =>
      db.query.orders.findFirst({
        where: eq(orders.idempotencyKey, key),
        with: { shipments: { with: { warehouse: true } } },
      }),

    findById: (id: string): Promise<OrderWithShipments | undefined> =>
      db.query.orders.findFirst({
        where: eq(orders.id, id),
        with: { shipments: { with: { warehouse: true } } },
      }),

    /**
     * Inserts an order; on idempotency-key conflict returns `null` (caller
     * re-reads the existing row). Single round-trip via ON CONFLICT — replaces
     * the older try/catch-on-unique-violation pattern.
     */
    insertIfFresh: async (tx: Querier, values: OrderInsert): Promise<OrderRow | null> => {
      const inserted = await tx
        .insert(orders)
        .values(values)
        .onConflictDoNothing({ target: orders.idempotencyKey })
        .returning();
      return inserted[0] ?? null;
    },

    insertShipments: async (tx: Querier, rows: ShipmentInsert[]): Promise<void> => {
      await tx.insert(shipments).values(rows);
    },

    /**
     * Reads-with-shipments inside a tx for return shapes. Lives on the repo so
     * routes/services never call db.query directly.
     */
    findByIdInTx: (tx: Querier, id: string): Promise<OrderWithShipments | undefined> =>
      tx.query.orders.findFirst({
        where: eq(orders.id, id),
        with: { shipments: { with: { warehouse: true } } },
      }),

    /**
     * Cursor pagination using a composite (createdAt, id) key so rows sharing a
     * createdAt timestamp paginate deterministically. We over-fetch by one to
     * detect whether more pages exist.
     */
    listPaginated: async (opts: {
      limit: number;
      cursor?: { createdAt: Date; id: string };
    }): Promise<OrderWithShipments[]> => {
      const where = opts.cursor
        ? or(
            lt(orders.createdAt, opts.cursor.createdAt),
            and(eq(orders.createdAt, opts.cursor.createdAt), lt(orders.id, opts.cursor.id)),
          )
        : undefined;

      const rows = await db.query.orders.findMany({
        ...(where ? { where } : {}),
        orderBy: [desc(orders.createdAt), desc(orders.id)],
        limit: opts.limit,
        with: { shipments: { with: { warehouse: true } } },
      });
      return rows;
    },
  };
}

export type OrderRepository = ReturnType<typeof createOrderRepository>;
