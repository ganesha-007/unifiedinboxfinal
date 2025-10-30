let IORedis: any;
try { IORedis = require('ioredis'); } catch { IORedis = null; }

let redis: any = null;

export function getRedis(): any {
  try {
    if (redis) return redis;
    const url = process.env.REDIS_URL;
    if (!url) return null;
    const tls = (process.env.REDIS_TLS || 'false').toLowerCase() === 'true';
    const db = Number(process.env.REDIS_DB || 0);
    if (!IORedis) return null;
    redis = new IORedis(url, { 
      tls: tls ? {} : undefined, 
      db,
      maxRetriesPerRequest: null, // Required for BullMQ
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      lazyConnect: true
    });
    redis.on('error', (e: unknown) => console.error('Redis error', e));
    return redis;
  } catch (e) {
    console.error('Failed to init Redis', e);
    return null;
  }
}

export async function quitRedis() {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}


