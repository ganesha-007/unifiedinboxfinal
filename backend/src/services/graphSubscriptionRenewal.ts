import { Queue, Worker, Job } from 'bullmq';
import { getRedis } from './redisClient';
import { graphWebhookService } from './graphWebhookService';
import { pool } from '../config/database';
import { captureError } from './monitoring';

interface SubscriptionRenewalJobData {
  subscriptionId: string;
  userId: string;
}

let renewalQueue: Queue | null = null;
let renewalWorker: Worker | null = null;

/**
 * Initialize the subscription renewal queue and worker
 */
export async function initSubscriptionRenewalService() {
  try {
    const redis = getRedis();
    if (!redis) {
      console.log('⚠️ Redis not available, skipping subscription renewal service initialization');
      return null;
    }

    const queuePrefix = process.env.BULLMQ_PREFIX || 'whatsapp_integration';

    console.log('🔄 Initializing Graph subscription renewal service...');

    // Initialize renewal queue
    renewalQueue = new Queue('graphSubscriptionRenewal', {
      connection: redis,
      prefix: queuePrefix,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 100,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 30000, // 30 seconds
        },
      },
    });

    // Initialize renewal worker
    renewalWorker = new Worker(
      'graphSubscriptionRenewal',
      async (job: Job<SubscriptionRenewalJobData>) => {
        console.log(`🔄 Processing subscription renewal job ${job.id}:`, job.data);
        await processSubscriptionRenewal(job.data);
      },
      {
        connection: redis,
        concurrency: 2, // Process 2 renewals at a time
        prefix: queuePrefix,
      }
    );

    // Event handlers
    renewalWorker.on('completed', (job) => {
      console.log(`✅ Subscription renewal job ${job.id} completed`);
    });

    renewalWorker.on('failed', (job, err) => {
      console.error(`❌ Subscription renewal job ${job?.id} failed:`, err);
      captureError(err, { jobId: job?.id, jobData: job?.data });
    });

    renewalWorker.on('stalled', (jobId) => {
      console.warn(`⚠️ Subscription renewal job ${jobId} stalled`);
    });

    renewalWorker.on('error', (err) => {
      console.error('❌ Subscription renewal worker error:', err);
      captureError(err);
    });

    // Schedule periodic renewal check
    await schedulePeriodicRenewalCheck();

    console.log('✅ Graph subscription renewal service initialized successfully');
    return { renewalQueue, renewalWorker };
  } catch (error: any) {
    console.error('❌ Failed to initialize subscription renewal service:', error);
    captureError(error);
    return null;
  }
}

/**
 * Schedule periodic renewal check (every 30 minutes)
 */
async function schedulePeriodicRenewalCheck() {
  if (!renewalQueue) return;

  try {
    // Remove existing periodic job if it exists
    await renewalQueue.removeRepeatable('periodicRenewalCheck', {
      pattern: '*/30 * * * *', // Every 30 minutes
    });

    // Add new periodic job
    await renewalQueue.add(
      'periodicRenewalCheck',
      {},
      {
        repeat: {
          pattern: '*/30 * * * *', // Every 30 minutes
        },
        jobId: 'periodicRenewalCheck',
      }
    );

    console.log('✅ Scheduled periodic subscription renewal check');
  } catch (error: any) {
    console.error('❌ Failed to schedule periodic renewal check:', error);
    captureError(error);
  }
}

/**
 * Process subscription renewal job
 */
async function processSubscriptionRenewal(data: SubscriptionRenewalJobData) {
  const { subscriptionId, userId } = data;

  try {
    console.log(`🔄 Processing subscription renewal for ${subscriptionId}`);

    // Get user's Outlook access token
    const credentialsResult = await pool.query(
      'SELECT outlook_access_token, outlook_refresh_token FROM user_credentials WHERE user_id = $1',
      [userId]
    );

    if (credentialsResult.rows.length === 0) {
      throw new Error(`No Outlook credentials found for user ${userId}`);
    }

    const { outlook_access_token, outlook_refresh_token } = credentialsResult.rows[0];

    if (!outlook_access_token) {
      // Try to refresh token if refresh token exists
      if (outlook_refresh_token) {
        console.log('🔄 Attempting to refresh Outlook token...');
        const newAccessToken = await refreshOutlookToken(userId, outlook_refresh_token);
        if (newAccessToken) {
          console.log('✅ Successfully refreshed Outlook token');
        } else {
          throw new Error('Failed to refresh Outlook token');
        }
      } else {
        throw new Error(`No Outlook access token or refresh token found for user ${userId}`);
      }
    }

    // Renew the subscription
    const renewedSubscription = await graphWebhookService.renewSubscription(
      subscriptionId,
      outlook_access_token
    );

    console.log(`✅ Successfully renewed subscription ${subscriptionId}:`, {
      newExpiration: renewedSubscription.expirationDatetime
    });

    // Schedule next renewal check (1 hour before expiration)
    await scheduleSubscriptionRenewal(subscriptionId, userId, renewedSubscription.expirationDatetime);

  } catch (error: any) {
    console.error(`❌ Failed to renew subscription ${subscriptionId}:`, error);

    // If renewal fails, mark subscription as expired
    try {
      await graphWebhookService.markSubscriptionExpired(subscriptionId);
      console.log(`⚠️ Marked subscription ${subscriptionId} as expired due to renewal failure`);
    } catch (markError: any) {
      console.error('❌ Failed to mark subscription as expired:', markError);
    }

    captureError(error, { subscriptionId, userId });
    throw error;
  }
}

/**
 * Schedule renewal for a specific subscription
 */
export async function scheduleSubscriptionRenewal(
  subscriptionId: string,
  userId: string,
  expirationDateTime: Date
) {
  if (!renewalQueue) {
    console.warn('⚠️ Renewal queue not initialized, cannot schedule renewal');
    return;
  }

  try {
    // Schedule renewal 1 hour before expiration
    const renewalTime = new Date(expirationDateTime);
    renewalTime.setHours(renewalTime.getHours() - 1);

    // Only schedule if renewal time is in the future
    if (renewalTime <= new Date()) {
      console.warn(`⚠️ Subscription ${subscriptionId} expires too soon, scheduling immediate renewal`);
      renewalTime.setMinutes(renewalTime.getMinutes() + 5); // Schedule in 5 minutes
    }

    await renewalQueue.add(
      'renewSubscription',
      { subscriptionId, userId },
      {
        delay: renewalTime.getTime() - Date.now(),
        jobId: `renewal-${subscriptionId}`,
      }
    );

    console.log(`✅ Scheduled renewal for subscription ${subscriptionId} at ${renewalTime.toISOString()}`);
  } catch (error: any) {
    console.error(`❌ Failed to schedule renewal for subscription ${subscriptionId}:`, error);
    captureError(error, { subscriptionId, userId, expirationDateTime });
  }
}

/**
 * Check for subscriptions that need renewal and schedule them
 */
export async function checkAndScheduleRenewals() {
  try {
    console.log('🔄 Checking for subscriptions that need renewal...');

    const subscriptionsNeedingRenewal = await graphWebhookService.getSubscriptionsNeedingRenewal();

    console.log(`📊 Found ${subscriptionsNeedingRenewal.length} subscriptions needing renewal`);

    for (const subscription of subscriptionsNeedingRenewal) {
      try {
        await scheduleSubscriptionRenewal(
          subscription.subscriptionId,
          subscription.userId,
          subscription.expirationDatetime
        );
      } catch (error: any) {
        console.error(`❌ Failed to schedule renewal for subscription ${subscription.subscriptionId}:`, error);
        captureError(error, { subscription });
      }
    }

    console.log('✅ Completed renewal check');
  } catch (error: any) {
    console.error('❌ Failed to check for renewals:', error);
    captureError(error);
  }
}

/**
 * Refresh Outlook access token using refresh token
 */
async function refreshOutlookToken(userId: string, refreshToken: string): Promise<string | null> {
  try {
    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: 'Mail.Read Mail.Send Mail.ReadWrite User.Read offline_access'
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ Token refresh failed:', tokenResponse.status, errorText);
      return null;
    }

    const tokens = await tokenResponse.json() as any;

    // Update tokens in database
    await pool.query(
      `UPDATE user_credentials 
       SET outlook_access_token = $2, outlook_refresh_token = $3, outlook_token_expiry = $4, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [
        userId,
        tokens.access_token,
        tokens.refresh_token || refreshToken, // Keep old refresh token if new one not provided
        new Date(Date.now() + tokens.expires_in * 1000)
      ]
    );

    return tokens.access_token;
  } catch (error: any) {
    console.error('❌ Failed to refresh Outlook token:', error);
    captureError(error, { userId });
    return null;
  }
}

/**
 * Get renewal queue health information
 */
export async function getRenewalQueueHealth() {
  if (!renewalQueue) {
    return { available: false };
  }

  try {
    const waiting = await renewalQueue.getWaiting();
    const active = await renewalQueue.getActive();
    const completed = await renewalQueue.getCompleted();
    const failed = await renewalQueue.getFailed();

    return {
      available: true,
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
    };
  } catch (error: any) {
    console.error('❌ Failed to get renewal queue health:', error);
    return { available: false, error: error.message };
  }
}

/**
 * Close renewal service
 */
export async function closeSubscriptionRenewalService() {
  console.log('🔄 Closing subscription renewal service...');

  if (renewalWorker) {
    await renewalWorker.close();
    renewalWorker = null;
  }

  if (renewalQueue) {
    await renewalQueue.close();
    renewalQueue = null;
  }

  console.log('✅ Subscription renewal service closed');
}
