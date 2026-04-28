import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { isKnownError } from './errors.js';
import { healthRoutes } from './routes/health.js';
import { orderRoutes } from './routes/orders.js';
import { warehouseRoutes } from './routes/warehouses.js';
import { registerDb } from './db/plugin.js';
import { registerServices } from './services/container.js';
import type { Db } from './db/client.js';

export interface BuildAppOptions {
  logLevel?: string;
  nodeEnv?: string;
  /** Pre-created Db (tests pass their own; pool lifecycle stays with caller). */
  db?: Db;
  /** Required when `db` is not provided. */
  databaseUrl?: string;
  poolMax?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
  statementTimeoutMs?: number;
  slowQueryMs?: number;
  txMaxRetries?: number;
  logQueries?: boolean;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {

  const app = Fastify({
    logger: { level: opts.logLevel ?? 'info' },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const dbOpts: Parameters<typeof registerDb>[1] = {};

  if (opts.db) dbOpts.db = opts.db;
  if (opts.databaseUrl !== undefined) dbOpts.url = opts.databaseUrl;
  if (opts.poolMax !== undefined) dbOpts.poolMax = opts.poolMax;
  if (opts.idleTimeoutMs !== undefined) dbOpts.idleTimeoutMs = opts.idleTimeoutMs;
  if (opts.connectionTimeoutMs !== undefined) dbOpts.connectionTimeoutMs = opts.connectionTimeoutMs;
  if (opts.statementTimeoutMs !== undefined) dbOpts.statementTimeoutMs = opts.statementTimeoutMs;
  if (opts.logQueries) dbOpts.logQueries = true;

  registerDb(app, dbOpts);

  registerServices(app, { 
    txMaxRetries: opts.txMaxRetries ?? 3 
  });

  // Slow-request observability. Per-query timing requires a deeper Drizzle
  // hook; request-level tracking is the highest-signal addition we can make
  // without monkey-patching the pg pool.
  const slowMs = opts.slowQueryMs ?? 250;

  app.addHook('onResponse', async (req, reply) => {
    const elapsed = reply.elapsedTime;

    // Log at warn level if the request took longer than our configured threshold, including DB stats for additional context.
    if (elapsed >= slowMs) {
      req.log.warn(
        { 
          url: req.url, 
          method: req.method, 
          statusCode: reply.statusCode, 
          elapsedMs: elapsed, 
          dbStats: app.dbStats() 
        },
        'slow request',
      );
    }
  });

  await app.register(swagger, {
    openapi: {
      info: { title: 'ScreenCloud OMS API', version: '1.0.0' },
      servers: [{ url: '/' }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

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
