import type { FastifyCorsOptions } from '@fastify/cors';

export function createCorsOptions(env: NodeJS.ProcessEnv = process.env): FastifyCorsOptions {
  const origins = (env.ALLOWED_ORIGINS || '*').split(',').map(value => value.trim()).filter(Boolean);
  const credentials = env.CORS_CREDENTIALS === 'true';

  if (credentials && origins.includes('*')) {
    throw new Error('ALLOWED_ORIGINS must be explicit when CORS_CREDENTIALS=true');
  }

  return {
    origin: origins.includes('*') ? '*' : origins.length === 1 ? origins[0] : origins,
    credentials,
    methods: ['GET'],
  };
}

export { default } from '@fastify/cors';
