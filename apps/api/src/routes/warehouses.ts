import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { asc } from 'drizzle-orm';
import { WarehousesResponseSchema } from '@scos/shared';
import { db } from '../db/client.js';
import { warehouses } from '../db/schema.js';

// eslint-disable-next-line @typescript-eslint/require-await
export const warehouseRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', {
    schema: { response: { 200: WarehousesResponseSchema } },
  }, async () => {
    const rows = await db().select().from(warehouses).orderBy(asc(warehouses.id));
    return rows.map((w) => ({
      id: w.id,
      name: w.name,
      latitude: w.latitude,
      longitude: w.longitude,
      stock: w.stock,
    }));
  });
};
