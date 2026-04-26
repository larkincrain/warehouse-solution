import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { isKnownError } from './errors.js';
import { healthRoutes } from './routes/health.js';

export async function buildApp(opts: { logLevel?: string } = {}): Promise<FastifyInstance> {
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
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(async (api) => {
    await api.register(healthRoutes);
  }, { prefix: '/api/v1' });

  app.setErrorHandler<Error & { statusCode?: number }>((err, req, reply) => {
    if (isKnownError(err)) {
      const body: Record<string, unknown> = { error: err.code, message: err.message };
      if (err.code === 'INSUFFICIENT_STOCK') {
        body.availableStock = (err as { availableStock: unknown }).availableStock;
      }
      return reply.status(err.httpStatus).send(body);
    }
    if (err.statusCode === 400) {
      return reply.status(400).send({ error: 'BAD_REQUEST', message: err.message });
    }
    req.log.error(err);
    return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  });

  return app;
}
