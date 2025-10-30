import { Request, Response } from 'express';
import { graphWebhookService } from '../services/graphWebhookService';
import { pool } from '../config/database';
import { captureError } from '../services/monitoring';
import { AuthRequest } from '../middleware/auth';
import { enqueueSend } from '../services/emailQueue.service';

/**
 * Webhook validation endpoint for Microsoft Graph subscriptions
 * Microsoft Graph sends a GET request with validationToken parameter during subscription creation
 */
export async function validateGraphWebhook(req: Request, res: Response) {
  try {
    const { validationToken } = req.query;
    
    console.log('🔍 Graph webhook validation request:', { validationToken });
    
    if (!validationToken) {
      return res.status(400).json({ error: 'Missing validationToken parameter' });
    }
    
    // Microsoft Graph expects the validation token to be returned as plain text
    console.log('✅ Graph webhook validation successful');
    res.status(200).type('text/plain').send(validationToken);
  } catch (error: any) {
    console.error('❌ Graph webhook validation error:', error);
    captureError(error);
    res.status(500).json({ error: 'Webhook validation failed' });
  }
}

/**
 * Handle Microsoft Graph webhook notifications
 * Microsoft Graph sends POST requests with notification data
 */
export async function handleGraphWebhookNotifications(req: Request, res: Response) {
  try {
    console.log('📧 Graph webhook notification received:', JSON.stringify(req.body, null, 2));
    
    const { value } = req.body;
    
    if (!value || !Array.isArray(value)) {
      console.log('⚠️ Invalid notification format, missing value array');
      return res.status(400).json({ error: 'Invalid notification format' });
    }
    
    // Process each notification in the batch
    const processedEvents: number[] = [];
    
    for (const notification of value) {
      try {
        const eventId = await processGraphNotification(notification);
        if (eventId) {
          processedEvents.push(eventId);
        }
      } catch (error: any) {
        console.error('❌ Failed to process individual notification:', error);
        captureError(error, { notification });
      }
    }
    
    console.log(`✅ Processed ${processedEvents.length} Graph notifications`);
    
    // Microsoft Graph expects a 202 Accepted response
    res.status(202).json({ 
      received: true, 
      processedEvents: processedEvents.length,
      eventIds: processedEvents
    });
  } catch (error: any) {
    console.error('❌ Graph webhook notification error:', error);
    captureError(error);
    res.status(500).json({ error: 'Failed to process Graph webhook notifications' });
  }
}

/**
 * Process individual Graph notification
 */
async function processGraphNotification(notification: any): Promise<number | null> {
  try {
    const {
      subscriptionId,
      changeType,
      clientState,
      resource,
      resourceData,
      lifecycleEvent,
      tenantId,
      subscriptionExpirationDateTime
    } = notification;
    
    console.log('🔄 Processing Graph notification:', {
      subscriptionId,
      changeType,
      resource,
      lifecycleEvent
    });
    
    // Verify subscription exists and get client state
    const subscription = await graphWebhookService.getSubscription(subscriptionId);
    if (!subscription) {
      console.warn('⚠️ Received notification for unknown subscription:', subscriptionId);
      return null;
    }
    
    // Verify client state for security
    if (clientState !== subscription.clientState) {
      console.error('❌ Client state mismatch for subscription:', subscriptionId);
      captureError(new Error('Client state mismatch'), { subscriptionId, clientState });
      return null;
    }
    
    // Handle lifecycle events (subscription expiration warnings, etc.)
    if (lifecycleEvent) {
      await handleLifecycleEvent(subscription, lifecycleEvent, subscriptionExpirationDateTime);
    }
    
    // Store the event for processing
    const eventId = await graphWebhookService.storeWebhookEvent(
      subscriptionId,
      changeType,
      clientState,
      resource,
      resourceData,
      lifecycleEvent,
      tenantId
    );
    
    // Enqueue for background processing via BullMQ
    if (eventId) {
      await enqueueSend('processGraphNotification', {
        type: 'processGraphNotification',
        eventId,
        subscriptionId,
        changeType,
        resource,
        userId: subscription.userId
      });
      
      console.log(`✅ Enqueued Graph notification processing for event ${eventId}`);
    }
    
    return eventId;
  } catch (error: any) {
    console.error('❌ Failed to process Graph notification:', error);
    captureError(error, { notification });
    return null;
  }
}

/**
 * Handle lifecycle events (subscription expiration, etc.)
 */
async function handleLifecycleEvent(
  subscription: any, 
  lifecycleEvent: string, 
  subscriptionExpirationDateTime?: string
) {
  try {
    console.log('🔄 Handling lifecycle event:', { lifecycleEvent, subscriptionId: subscription.subscriptionId });
    
    switch (lifecycleEvent) {
      case 'subscriptionRemoved':
        // Mark subscription as expired in database
        await graphWebhookService.markSubscriptionExpired(subscription.subscriptionId);
        console.log('✅ Marked subscription as expired:', subscription.subscriptionId);
        break;
        
      case 'missed':
        // Handle missed notifications - might need to sync data
        console.log('⚠️ Missed notifications for subscription:', subscription.subscriptionId);
        // Could trigger a full sync here
        break;
        
      default:
        console.log('ℹ️ Unknown lifecycle event:', lifecycleEvent);
    }
  } catch (error: any) {
    console.error('❌ Failed to handle lifecycle event:', error);
    captureError(error, { subscription, lifecycleEvent });
  }
}

/**
 * Create a new Graph webhook subscription
 */
export async function createGraphSubscription(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { resource, changeType } = req.body;
    
    // Get user's Outlook access token
    const credentialsResult = await pool.query(
      'SELECT outlook_access_token FROM user_credentials WHERE user_id = $1',
      [userId]
    );
    
    if (credentialsResult.rows.length === 0 || !credentialsResult.rows[0].outlook_access_token) {
      return res.status(400).json({ error: 'Outlook credentials not found' });
    }
    
    const accessToken = credentialsResult.rows[0].outlook_access_token;
    
    // Create subscription
    const subscription = await graphWebhookService.createSubscription(
      userId,
      accessToken,
      resource || '/me/mailFolders/inbox/messages',
      changeType || 'created,updated'
    );
    
    console.log('✅ Graph subscription created:', subscription);
    
    res.json({
      success: true,
      subscription: {
        id: subscription.subscriptionId,
        resource: subscription.resource,
        changeType: subscription.changeType,
        expirationDateTime: subscription.expirationDatetime,
        status: subscription.status
      }
    });
  } catch (error: any) {
    console.error('❌ Failed to create Graph subscription:', error);
    captureError(error, { userId: req.user?.id });
    res.status(500).json({ error: error.message || 'Failed to create Graph subscription' });
  }
}

/**
 * List user's Graph webhook subscriptions
 */
export async function listGraphSubscriptions(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const subscriptions = await graphWebhookService.listUserSubscriptions(userId);
    
    res.json({
      success: true,
      subscriptions: subscriptions.map(sub => ({
        id: sub.subscriptionId,
        resource: sub.resource,
        changeType: sub.changeType,
        expirationDateTime: sub.expirationDatetime,
        status: sub.status,
        createdAt: sub.createdAt
      }))
    });
  } catch (error: any) {
    console.error('❌ Failed to list Graph subscriptions:', error);
    captureError(error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to list Graph subscriptions' });
  }
}

/**
 * Delete a Graph webhook subscription
 */
export async function deleteGraphSubscription(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { subscriptionId } = req.params;
    
    // Get user's Outlook access token
    const credentialsResult = await pool.query(
      'SELECT outlook_access_token FROM user_credentials WHERE user_id = $1',
      [userId]
    );
    
    if (credentialsResult.rows.length === 0 || !credentialsResult.rows[0].outlook_access_token) {
      return res.status(400).json({ error: 'Outlook credentials not found' });
    }
    
    const accessToken = credentialsResult.rows[0].outlook_access_token;
    
    // Delete subscription
    await graphWebhookService.deleteSubscription(userId, subscriptionId, accessToken);
    
    console.log('✅ Graph subscription deleted:', subscriptionId);
    
    res.json({
      success: true,
      message: 'Graph subscription deleted successfully'
    });
  } catch (error: any) {
    console.error('❌ Failed to delete Graph subscription:', error);
    captureError(error, { userId: req.user?.id, subscriptionId: req.params.subscriptionId });
    res.status(500).json({ error: error.message || 'Failed to delete Graph subscription' });
  }
}

/**
 * Renew a Graph webhook subscription
 */
export async function renewGraphSubscription(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { subscriptionId } = req.params;
    
    // Get user's Outlook access token
    const credentialsResult = await pool.query(
      'SELECT outlook_access_token FROM user_credentials WHERE user_id = $1',
      [userId]
    );
    
    if (credentialsResult.rows.length === 0 || !credentialsResult.rows[0].outlook_access_token) {
      return res.status(400).json({ error: 'Outlook credentials not found' });
    }
    
    const accessToken = credentialsResult.rows[0].outlook_access_token;
    
    // Renew subscription
    const renewedSubscription = await graphWebhookService.renewSubscription(subscriptionId, accessToken);
    
    console.log('✅ Graph subscription renewed:', renewedSubscription);
    
    res.json({
      success: true,
      subscription: {
        id: renewedSubscription.subscriptionId,
        expirationDateTime: renewedSubscription.expirationDatetime,
        status: renewedSubscription.status
      }
    });
  } catch (error: any) {
    console.error('❌ Failed to renew Graph subscription:', error);
    captureError(error, { userId: req.user?.id, subscriptionId: req.params.subscriptionId });
    res.status(500).json({ error: error.message || 'Failed to renew Graph subscription' });
  }
}

/**
 * Get Graph webhook statistics
 */
export async function getGraphWebhookStats(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Get subscription count
    const subscriptionResult = await pool.query(
      'SELECT COUNT(*) as total, status FROM graph_webhook_subscriptions WHERE user_id = $1 GROUP BY status',
      [userId]
    );
    
    // Get recent events count
    const eventsResult = await pool.query(
      `SELECT COUNT(*) as total, processed 
       FROM graph_webhook_events gwe
       JOIN graph_webhook_subscriptions gws ON gwe.subscription_id = gws.subscription_id
       WHERE gws.user_id = $1 AND gwe.event_time >= NOW() - INTERVAL '24 hours'
       GROUP BY processed`,
      [userId]
    );
    
    const subscriptionStats = subscriptionResult.rows.reduce((acc: any, row) => {
      acc[row.status] = parseInt(row.total);
      return acc;
    }, {});
    
    const eventStats = eventsResult.rows.reduce((acc: any, row) => {
      acc[row.processed ? 'processed' : 'pending'] = parseInt(row.total);
      return acc;
    }, {});
    
    res.json({
      success: true,
      stats: {
        subscriptions: subscriptionStats,
        events24h: eventStats
      }
    });
  } catch (error: any) {
    console.error('❌ Failed to get Graph webhook stats:', error);
    captureError(error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to get Graph webhook statistics' });
  }
}
