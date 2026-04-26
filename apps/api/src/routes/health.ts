import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { HealthResponseSchema, ReadyResponseSchema } from '@scos/shared';
import { db } from '../db/client.js';

// eslint-disable-next-line @typescript-eslint/require-await
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', {
    schema: { response: { 200: HealthResponseSchema } },
    // eslint-disable-next-line @typescript-eslint/require-await
  }, async () => ({ status: 'ok' as const }));

  app.get('/ready', {
    schema: { response: { 200: ReadyResponseSchema, 503: ReadyResponseSchema } },
  }, async (_req, reply) => {
    try {
      await db().execute(sql`select 1`);
      return { status: 'ok' as const };
    } catch (err) {
      reply.log.warn({ err }, '/ready db check failed');
      return reply.status(503).send({ status: 'unavailable' as const });
    }
  });
}
