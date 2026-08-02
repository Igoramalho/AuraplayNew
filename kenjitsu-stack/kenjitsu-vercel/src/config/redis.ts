import 'dotenv/config';
import { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';

const namespace = process.env.REDIS_NAMESPACE || 'kenjitsu';
const host = process.env.REDIS_HOST;
const password = process.env.REDIS_PASSWORD;
const port = Number(process.env.REDIS_PORT || 6379);
const enabled = Boolean(host);

const redis = enabled
  ? new Redis({
      host,
      port,
      password,
      keyPrefix: `${namespace}:`,
      tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    })
  : null;

export async function checkRedis(log?: FastifyBaseLogger) {
  if (!redis) {
    log?.info('Redis disabled');
    return false;
  }
  try {
    if (redis.status === 'wait' || redis.status === 'end') await redis.connect();
    log?.info('Redis connected');
    return true;
  } catch (error) {
    log?.warn({ err: error }, 'Redis unavailable; continuing without cache');
    return false;
  }
}

function cacheKey(key: string) {
  return key.replace(/[\r\n]/g, '').slice(0, 512);
}

export async function redisSetCache<T>(key: string, value: T, ttlInHours = 1): Promise<void> {
  if (!redis || redis.status !== 'ready') return;
  const serialized = JSON.stringify(value);
  if (ttlInHours === 0) await redis.set(cacheKey(key), serialized);
  else await redis.set(cacheKey(key), serialized, 'EX', Math.max(1, Math.round(ttlInHours * 3600)));
}

export async function redisGetCache<T>(key: string): Promise<T | null> {
  if (!redis || redis.status !== 'ready') return null;
  const data = await redis.get(cacheKey(key));
  if (!data) return null;
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

export async function purgeCache(key: string): Promise<void> {
  if (redis && redis.status === 'ready') await redis.del(cacheKey(key));
}
