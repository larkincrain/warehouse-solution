import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { WarehousesResponseSchema } from '@scos/shared';

export const warehouseRoutes: FastifyPluginAsyncZod = (app) => {

  app.get('/', {
    schema: { response: { 200: WarehousesResponseSchema } },
  }, async (req) => {

    const rows = await req.server.services.warehouses.listAll();

    return rows.map((w) => ({
      id: w.id,
      name: w.name,
      latitude: w.latitude,
      longitude: w.longitude,
      stock: w.stock,
    }));
  });

  return Promise.resolve();
};
