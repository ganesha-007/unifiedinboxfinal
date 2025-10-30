import { getRedis } from './redisClient';

const redis = getRedis();

export async function getJson<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  const raw = await redis.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export async function setJson(key: string, value: unknown, ttlSec: number): Promise<void> {
  if (!redis) return;
  await redis.set(key, JSON.stringify(value), 'EX', ttlSec);
}

export async function del(key: string): Promise<void> {
  if (!redis) return;
  await redis.del(key);
}


