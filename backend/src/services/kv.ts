import { getRedis } from './redisClient';

const redis = getRedis();

export async function incrWithTtl(key: string, by: number, ttlMs: number): Promise<number> {
  if (!redis) return 0;
  const multi = redis.multi();
  multi.incrby(key, by);
  multi.pexpire(key, ttlMs, 'NX');
  const res = await multi.exec();
  const val = res?.[0]?.[1] as number | undefined;
  return typeof val === 'number' ? val : 0;
}

export async function getNumber(key: string): Promise<number> {
  if (!redis) return 0;
  const v = await redis.get(key);
  return v ? Number(v) : 0;
}

export async function setIfAllowed(key: string, value: string, ttlSec: number): Promise<boolean> {
  if (!redis) return true; // allow when redis absent
  const ok = await redis.set(key, value, 'EX', ttlSec, 'NX');
  return ok === 'OK';
}

export async function getString(key: string): Promise<string | null> {
  if (!redis) return null;
  return await redis.get(key);
}

export async function setString(key: string, value: string, ttlMs: number): Promise<void> {
  if (!redis) return;
  await redis.set(key, value, 'PX', ttlMs);
}


