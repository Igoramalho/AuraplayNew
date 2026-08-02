import 'dotenv/config';
import Fastify from 'fastify';

import StaticRoutes from './routes/static.js';
import AnizoneRoutes from './routes/anime/anizone.js';
import AnilistRoutes from './routes/meta/anilist.js';
import TheMovieDatabaseRoutes from './routes/meta/tmdb.js';
import { ratelimitOptions, rateLimitPlugIn } from './config/ratelimit.js';
import fastifyCors, { createCorsOptions } from './config/cors.js';
import { checkRedis } from './config/redis.js';
import AnikotoRoutes from './routes/anime/anikoto.js';
import AniDBRoutes from './routes/anime/anidb.js';
import AnimeHeavenRoutes from './routes/anime/animeheaven.js';
import AniBDRoutes from './routes/anime/anibd.js';

export interface BuildAppOptions {
  connectRedis?: boolean;
  logger?: boolean;
  staticAssets?: boolean;
}

export const sensitiveLogPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers.x-api-key',
  'request.headers.authorization',
  'request.headers.cookie',
  'request.headers.x-api-key',
  '*.token',
  '*.password',
  '*.url',
  '*.sources',
];

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? {
      level: process.env.LOG_LEVEL || 'info',
      redact: {
        paths: sensitiveLogPaths,
        censor: '[Redacted]',
      },
      serializers: {
        req: req => ({ method: req.method, pathname: new URL(req.url, 'http://localhost').pathname }),
        res: res => ({ statusCode: res.statusCode }),
        err: error => ({ type: error.name, message: error.message, stack: '[Redacted]' }),
      },
    },
    routerOptions: { maxParamLength: 1000 },
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    if (reply.statusCode !== 200) {
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      reply.header('Surrogate-Control', 'no-store');
    } else {
      reply.removeHeader('x-ratelimit-remaining');
      reply.removeHeader('x-ratelimit-reset');
    }
    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Request failed');
    const safeError = error instanceof Error ? error : new Error('Unknown error');
    const candidate = 'statusCode' in safeError ? Number(safeError.statusCode) : 500;
    const statusCode = candidate >= 400 && candidate < 500 ? candidate : 500;
    return reply.status(statusCode).send({
      error: statusCode === 500 ? 'Internal Server Error' : safeError.name,
      message: statusCode === 500 ? 'An unexpected error occurred' : safeError.message,
    });
  });

  await app.register(rateLimitPlugIn, ratelimitOptions);
  await app.register(fastifyCors, createCorsOptions());

  app.get('/health', async () => ({ status: 'ok', redis: process.env.REDIS_HOST ? 'configured' : 'disabled' }));
  await app.register(AnilistRoutes, { prefix: '/api/anilist' });
  await app.register(AnikotoRoutes, { prefix: '/api/anikoto' });
  await app.register(AniDBRoutes, { prefix: '/api/anidb' });
  await app.register(AniBDRoutes, { prefix: '/api/anibd' });
  await app.register(AnizoneRoutes, { prefix: '/api/anizone' });
  await app.register(AnimeHeavenRoutes, { prefix: '/api/animeheaven' });
  await app.register(TheMovieDatabaseRoutes, { prefix: '/api/tmdb' });
  if (options.staticAssets !== false) await app.register(StaticRoutes);
  else {
    app.setNotFoundHandler(async (_request, reply) => reply.status(404).send({ error: 'Route Not Found' }));
  }

  if (options.connectRedis !== false) await checkRedis(app.log);
  return app;
}
