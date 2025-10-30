import { Worker, Job } from 'bullmq';
import { getRedis } from '../services/redisClient';
import { graphWebhookService } from '../services/graphWebhookService';
import { pool } from '../config/database';
import { captureError } from '../services/monitoring';
import { Client } from '@microsoft/microsoft-graph-client';

interface GraphNotificationJobData {
  type: string;
  eventId: number;
  subscriptionId: string;
  changeType: string;
  resource: string;
  userId: string;
}

let graphNotificationWorker: Worker | null = null;

export async function initGraphNotificationWorker() {
  try {
    const redis = getRedis();
    if (!redis) {
      console.log('⚠️ Redis not available, skipping Graph notification worker initialization');
      return null;
    }

    const concurrency = Number(process.env.GRAPH_NOTIFICATION_QUEUE_CONCURRENCY || 5);
    const queuePrefix = process.env.BULLMQ_PREFIX || 'whatsapp_integration';

    console.log('🔄 Initializing Graph notification worker...');

    graphNotificationWorker = new Worker(
      'email',
      async (job: Job<GraphNotificationJobData>) => {
        console.log(`🔄 Processing Graph notification job ${job.id}:`, job.data);
        
        if (job.data.type === 'processGraphNotification') {
          await processGraphNotificationJob(job.data);
        } else {
          console.log(`⚠️ Unknown Graph notification job type: ${job.data.type}`);
        }
      },
      {
        connection: redis,
        concurrency,
        prefix: queuePrefix,
      }
    );

    // Event handlers
    graphNotificationWorker.on('completed', (job) => {
      console.log(`✅ Graph notification job ${job.id} completed`);
    });

    graphNotificationWorker.on('failed', (job, err) => {
      console.error(`❌ Graph notification job ${job?.id} failed:`, err);
      captureError(err, { jobId: job?.id, jobData: job?.data });
    });

    graphNotificationWorker.on('stalled', (jobId) => {
      console.warn(`⚠️ Graph notification job ${jobId} stalled`);
    });

    graphNotificationWorker.on('error', (err) => {
      console.error('❌ Graph notification worker error:', err);
      captureError(err);
    });

    console.log('✅ Graph notification worker initialized successfully');
    return graphNotificationWorker;
  } catch (error: any) {
    console.error('❌ Failed to initialize Graph notification worker:', error);
    captureError(error);
    return null;
  }
}

/**
 * Process Graph notification job
 */
async function processGraphNotificationJob(data: GraphNotificationJobData) {
  const { eventId, subscriptionId, changeType, resource, userId } = data;
  
  try {
    console.log(`🔄 Processing Graph notification for user ${userId}:`, {
      eventId,
      subscriptionId,
      changeType,
      resource
    });

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
      throw new Error(`No Outlook access token found for user ${userId}`);
    }

    // Initialize Graph client
    const graphClient = Client.init({
      authProvider: (done: any) => {
        done(null, outlook_access_token);
      }
    });

    // Process based on change type
    switch (changeType) {
      case 'created':
        await handleMessageCreated(graphClient, resource, userId);
        break;
      case 'updated':
        await handleMessageUpdated(graphClient, resource, userId);
        break;
      case 'deleted':
        await handleMessageDeleted(resource, userId);
        break;
      default:
        console.log(`⚠️ Unknown change type: ${changeType}`);
    }

    // Mark event as processed
    await graphWebhookService.markEventProcessed(eventId, true);
    
    console.log(`✅ Successfully processed Graph notification ${eventId}`);
  } catch (error: any) {
    console.error(`❌ Failed to process Graph notification ${eventId}:`, error);
    
    // Mark event as failed and increment retry count
    await graphWebhookService.markEventProcessed(eventId, false, error.message);
    await graphWebhookService.incrementEventRetryCount(eventId);
    
    captureError(error, { eventId, subscriptionId, changeType, resource, userId });
    throw error; // Re-throw to trigger BullMQ retry mechanism
  }
}

/**
 * Handle new message created
 */
async function handleMessageCreated(graphClient: Client, resource: string, userId: string) {
  try {
    console.log(`📧 Handling new message created: ${resource}`);
    
    // Extract message ID from resource path
    const messageId = extractMessageIdFromResource(resource);
    if (!messageId) {
      console.warn('⚠️ Could not extract message ID from resource:', resource);
      return;
    }

    // Fetch message details from Graph API
    const message = await graphClient.api(`/me/messages/${messageId}`).get();
    
    console.log('📧 New message details:', {
      id: message.id,
      subject: message.subject,
      from: message.from?.emailAddress?.address,
      receivedDateTime: message.receivedDateTime
    });

    // Store message in database
    await storeOutlookMessage(message, userId);
    
    // Update usage statistics
    await updateUsageStats(userId, 'outlook', 'received');
    
    console.log(`✅ Successfully processed new message ${messageId}`);
  } catch (error: any) {
    console.error('❌ Failed to handle message created:', error);
    throw error;
  }
}

/**
 * Handle message updated
 */
async function handleMessageUpdated(graphClient: Client, resource: string, userId: string) {
  try {
    console.log(`📧 Handling message updated: ${resource}`);
    
    const messageId = extractMessageIdFromResource(resource);
    if (!messageId) {
      console.warn('⚠️ Could not extract message ID from resource:', resource);
      return;
    }

    // Fetch updated message details
    const message = await graphClient.api(`/me/messages/${messageId}`).get();
    
    console.log('📧 Updated message details:', {
      id: message.id,
      subject: message.subject,
      isRead: message.isRead
    });

    // Update message in database
    await updateOutlookMessage(message, userId);
    
    console.log(`✅ Successfully processed updated message ${messageId}`);
  } catch (error: any) {
    console.error('❌ Failed to handle message updated:', error);
    throw error;
  }
}

/**
 * Handle message deleted
 */
async function handleMessageDeleted(resource: string, userId: string) {
  try {
    console.log(`📧 Handling message deleted: ${resource}`);
    
    const messageId = extractMessageIdFromResource(resource);
    if (!messageId) {
      console.warn('⚠️ Could not extract message ID from resource:', resource);
      return;
    }

    // Mark message as deleted in database
    await pool.query(
      'UPDATE outlook_messages SET deleted = TRUE, updated_at = CURRENT_TIMESTAMP WHERE message_id = $1 AND user_id = $2',
      [messageId, userId]
    );
    
    console.log(`✅ Successfully processed deleted message ${messageId}`);
  } catch (error: any) {
    console.error('❌ Failed to handle message deleted:', error);
    throw error;
  }
}

/**
 * Extract message ID from Graph resource path
 */
function extractMessageIdFromResource(resource: string): string | null {
  // Resource format: /me/mailFolders/inbox/messages/{messageId}
  // or /me/messages/{messageId}
  const match = resource.match(/\/messages\/([^\/]+)$/);
  return match ? match[1] : null;
}

/**
 * Store Outlook message in database
 */
async function storeOutlookMessage(message: any, userId: string) {
  try {
    const query = `
      INSERT INTO outlook_messages (
        user_id, message_id, subject, sender, recipient, body, 
        received_at, is_read, has_attachments, folder_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, message_id) 
      DO UPDATE SET 
        subject = EXCLUDED.subject,
        is_read = EXCLUDED.is_read,
        updated_at = CURRENT_TIMESTAMP
    `;

    const values = [
      userId,
      message.id,
      message.subject || '',
      message.from?.emailAddress?.address || '',
      message.toRecipients?.[0]?.emailAddress?.address || '',
      message.body?.content || '',
      new Date(message.receivedDateTime),
      message.isRead || false,
      message.hasAttachments || false,
      message.parentFolderId || 'inbox'
    ];

    await pool.query(query, values);
    console.log(`✅ Stored Outlook message ${message.id} in database`);
  } catch (error: any) {
    console.error('❌ Failed to store Outlook message:', error);
    throw error;
  }
}

/**
 * Update Outlook message in database
 */
async function updateOutlookMessage(message: any, userId: string) {
  try {
    const query = `
      UPDATE outlook_messages 
      SET subject = $3, is_read = $4, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND message_id = $2
    `;

    const values = [
      userId,
      message.id,
      message.subject || '',
      message.isRead || false
    ];

    await pool.query(query, values);
    console.log(`✅ Updated Outlook message ${message.id} in database`);
  } catch (error: any) {
    console.error('❌ Failed to update Outlook message:', error);
    throw error;
  }
}

/**
 * Update usage statistics
 */
async function updateUsageStats(userId: string, provider: string, type: 'sent' | 'received') {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    await pool.query(
      `INSERT INTO usage_stats (user_id, provider, date, ${type})
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (user_id, provider, date)
       DO UPDATE SET ${type} = usage_stats.${type} + 1, updated_at = CURRENT_TIMESTAMP`,
      [userId, provider, today]
    );
  } catch (error: any) {
    console.error('❌ Failed to update usage stats:', error);
    // Don't throw here as this is not critical
  }
}

/**
 * Close Graph notification worker
 */
export async function closeGraphNotificationWorker() {
  if (graphNotificationWorker) {
    console.log('🔄 Closing Graph notification worker...');
    await graphNotificationWorker.close();
    graphNotificationWorker = null;
    console.log('✅ Graph notification worker closed');
  }
}

// Initialize worker if this file is run directly
if (require.main === module) {
  console.log('🚀 Starting Graph notification worker process...');
  
  initGraphNotificationWorker()
    .then(() => {
      console.log('✅ Graph notification worker process started successfully');
    })
    .catch((error) => {
      console.error('❌ Failed to start Graph notification worker process:', error);
      process.exit(1);
    });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('📴 Received SIGTERM, shutting down Graph notification worker gracefully...');
    await closeGraphNotificationWorker();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('📴 Received SIGINT, shutting down Graph notification worker gracefully...');
    await closeGraphNotificationWorker();
    process.exit(0);
  });
}
