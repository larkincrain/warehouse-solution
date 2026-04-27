import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { HealthResponseSchema, ReadyResponseSchema } from '@scos/shared';

export function healthRoutes(app: FastifyInstance): Promise<void> {

  // health check
  app.get('/health', {
    schema: { response: { 200: HealthResponseSchema } },
  }, () => ({ status: 'ok' as const }));

  // DB readiness check. This is used by Kubernetes to determine when the app is ready to receive traffic, 
  // so it should be a bit more thorough than the liveness check but still very fast.
  // We don't want to return "ready" if the app can't talk to the DB, 
  // but we also don't want this check to cause undue load on the DB or add significant latency to startup.
  app.get('/ready', {
    schema: { response: { 200: ReadyResponseSchema, 503: ReadyResponseSchema } },
  }, async (req, reply) => {

    try {
      await req.server.db.execute(sql`select 1`);
      return { status: 'ok' as const };
    } catch (err) {
      reply.log.warn({ err }, '/ready db check failed');
      return reply.status(503).send({ status: 'unavailable' as const });
    }

  });

  return Promise.resolve();
}
