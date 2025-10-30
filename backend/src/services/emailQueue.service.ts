// Types are available when bullmq is installed; to keep TS happy before install, use typeof any
// eslint-disable-next-line @typescript-eslint/no-var-requires
let BullMQ: any;
try { BullMQ = require('bullmq'); } catch { BullMQ = {}; }
const Queue = BullMQ.Queue as any;
const Worker = BullMQ.Worker as any;
const QueueScheduler = BullMQ.QueueScheduler as any;
type JobsOptions = any;
import { getRedis } from './redisClient';

type SendJob = {
  provider: 'gmail' | 'outlook';
  url: string; // internal API URL to call for send
  method?: 'POST';
  body: any;
  headers?: Record<string, string>;
};

type GraphNotificationJob = {
  type: 'processGraphNotification';
  eventId: number;
  subscriptionId: string;
  changeType: string;
  resource: string;
  userId: string;
};

const connection = (() => {
  const redis = getRedis();
  if (!redis) return undefined as any;
  // BullMQ accepts ioredis instance directly
  return redis;
})();

// Queue name must not contain ':' characters; use prefix for Redis keys instead
const QUEUE_NAME = 'email-send';
const QUEUE_PREFIX = process.env.BULLMQ_PREFIX || 'app';

let queue: any = null;
let worker: any = null;
let scheduler: any = null;

export function initEmailQueue() {
  if (!connection) return;
  if (queue) return;
  queue = new Queue(QUEUE_NAME, { connection, prefix: QUEUE_PREFIX });
  // QueueScheduler is optional; only initialize if available in current bullmq version
  try {
    if (QueueScheduler && typeof QueueScheduler === 'function') {
      scheduler = new QueueScheduler(QUEUE_NAME, { connection, prefix: QUEUE_PREFIX });
    }
  } catch (e) {
    console.warn('QueueScheduler not available, continuing without it');
  }

  const concurrency = Number(process.env.EMAIL_QUEUE_CONCURRENCY || 3);
  const mailboxPerHour = Number(process.env.QUEUE_LIMIT_MAILBOX_PER_HOUR || 50);
  const domainPerMin = Number(process.env.QUEUE_LIMIT_DOMAIN_PER_MIN || 1);

  worker = new Worker(
    QUEUE_NAME,
    async (job: any) => {
      console.log(`📧 Processing email job ${job.id} for ${job.data.provider}`);
      try {
        // Simple HTTP call back into API to reuse controller logic
        const res = await fetch(job.data.url, {
          method: job.data.method || 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(job.data.headers || {}),
          },
          body: JSON.stringify(job.data.body),
        });
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Send failed: ${res.status} - ${errorText}`);
        }
        const result = await res.json();
        console.log(`✅ Email job ${job.id} completed successfully`);
        return result;
      } catch (error) {
        console.error(`❌ Email job ${job.id} failed:`, error);
        throw error;
      }
    },
    {
      connection,
      concurrency,
      prefix: QUEUE_PREFIX,
      // Retry configuration
      settings: {
        stalledInterval: 30 * 1000, // 30 seconds
        maxStalledCount: 1,
      },
    }
  );

  // Worker event handlers
  worker.on('completed', (job: any) => {
    console.log(`✅ Job ${job.id} completed`);
  });

  worker.on('failed', (job: any, err: Error) => {
    console.error(`❌ Job ${job?.id} failed:`, err.message);
  });

  worker.on('stalled', (jobId: string) => {
    console.warn(`⚠️ Job ${jobId} stalled`);
  });
}

export async function enqueueSend(jobType: string, job: SendJob | GraphNotificationJob, opts?: JobsOptions) {
  if (!queue) return { queued: false };
  const j = await queue.add(jobType, job, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500,
    delay: opts?.delay || 0,
    ...(opts || {}),
  });
  return { queued: true, id: j.id };
}

export async function getQueueHealth() {
  if (!queue) return { available: false };
  
  try {
    const waiting = await queue.getWaiting();
    const active = await queue.getActive();
    const completed = await queue.getCompleted();
    const failed = await queue.getFailed();
    
    return {
      available: true,
      counts: {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
      },
    };
  } catch (error) {
    return { available: false, error: (error as Error).message };
  }
}

export async function closeQueue() {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (scheduler) {
    await scheduler.close();
    scheduler = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
}


