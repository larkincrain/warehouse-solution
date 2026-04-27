import { asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { warehouses } from '../db/schema.js';

export type WarehouseRow = typeof warehouses.$inferSelect;

/**
 * Drizzle's transaction handle has the same query API as the top-level Db
 * instance, so a single `Querier` type lets repository methods accept either.
 * Callers in a tx pass `tx`; ad-hoc reads pass the app db.
 */
export type Querier = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export function createWarehouseRepository(db: Db) {

  return {
    listAll: (): Promise<WarehouseRow[]> =>
      db
        .select()
        .from(warehouses)
        .orderBy(
          asc(
            warehouses.id
          )
        ),

    /** Locks all warehouse rows in deterministic id order. Use inside a tx. */
    lockAllForUpdate: (tx: Querier): Promise<WarehouseRow[]> =>
      tx
        .select()
        .from(warehouses)
        .orderBy(
          asc(
            warehouses.id
          )
        )
        .for('update'),

    decrementStock: async (tx: Querier, id: string, qty: number): Promise<void> => {
      await tx
        .update(warehouses)
        .set({ stock: sql`${warehouses.stock} - ${qty}` })
        .where(eq(warehouses.id, id));
    },
  };
}

export type WarehouseRepository = ReturnType<typeof createWarehouseRepository>;
