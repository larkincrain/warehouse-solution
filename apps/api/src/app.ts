import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { isKnownError } from './errors.js';
import { healthRoutes } from './routes/health.js';
import { orderRoutes } from './routes/orders.js';
import { warehouseRoutes } from './routes/warehouses.js';

export async function buildApp(opts: { logLevel?: string; nodeEnv?: string } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: opts.logLevel ?? 'info' },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(swagger, {
    openapi: {
      info: { title: 'ScreenCloud OMS API', version: '1.0.0' },
      servers: [{ url: '/' }],
    },
    transform: jsonSchemaTransform,
  });
  if (opts.nodeEnv !== 'production') {
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }

  // setErrorHandler MUST be registered BEFORE child plugin contexts.
  // Fastify v5 only inherits error handlers into children registered AFTER
  // this call — moving the /api/v1 register block above this would silently
  // route all 4xx domain errors back to the default 500 fallback.
  app.setErrorHandler<Error & { statusCode?: number }>((err, req, reply) => {
    if (isKnownError(err)) {
      const body: Record<string, unknown> = { error: err.code, message: err.message };
      if (err.code === 'INSUFFICIENT_STOCK') {
        body.availableStock = err.availableStock;
      }
      return reply.status(err.httpStatus).send(body);
    }
    if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
      const errorCode = err.statusCode === 400 ? 'BAD_REQUEST'
        : err.statusCode === 404 ? 'NOT_FOUND'
        : 'CLIENT_ERROR';
      return reply.status(err.statusCode).send({ error: errorCode, message: err.message });
    }
    req.log.error(err);
    return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  });

  await app.register(async (api) => {
    await api.register(healthRoutes);
    await api.register(orderRoutes, { prefix: '/orders' });
    await api.register(warehouseRoutes, { prefix: '/warehouses' });
  }, { prefix: '/api/v1' });

  return app;
}
