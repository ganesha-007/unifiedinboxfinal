import { Client } from '@microsoft/microsoft-graph-client';
import { pool } from '../config/database';
import { captureError } from './monitoring';
import crypto from 'crypto';

export interface GraphSubscription {
  id?: string;
  resource: string;
  changeType: string;
  notificationUrl: string;
  expirationDateTime: string;
  clientState?: string;
  applicationId?: string;
  creatorId?: string;
  latestSupportedTlsVersion?: string;
  lifecycleNotificationUrl?: string;
  encryptionCertificate?: string;
  encryptionCertificateId?: string;
  includeResourceData?: boolean;
}

export interface StoredSubscription {
  id: number;
  subscriptionId: string;
  userId: string;
  resource: string;
  changeType: string;
  notificationUrl: string;
  clientState: string;
  expirationDatetime: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export class GraphWebhookService {
  private static instance: GraphWebhookService;
  private baseNotificationUrl: string;

  constructor() {
    this.baseNotificationUrl = process.env.GRAPH_WEBHOOK_BASE_URL || 'https://your-domain.com';
  }

  static getInstance(): GraphWebhookService {
    if (!GraphWebhookService.instance) {
      GraphWebhookService.instance = new GraphWebhookService();
    }
    return GraphWebhookService.instance;
  }

  /**
   * Create a Microsoft Graph webhook subscription
   */
  async createSubscription(
    userId: string, 
    accessToken: string, 
    resource: string = '/me/mailFolders/inbox/messages',
    changeType: string = 'created,updated'
  ): Promise<StoredSubscription> {
    try {
      // Generate a unique client state for security
      const clientState = crypto.randomUUID();
      
      // Calculate expiration (max 4230 minutes for mail resources)
      const expirationDateTime = new Date();
      expirationDateTime.setMinutes(expirationDateTime.getMinutes() + 4200); // 70 hours (safe margin)

      const graphClient = Client.init({
        authProvider: (done: any) => {
          done(null, accessToken);
        }
      });

      const subscription: GraphSubscription = {
        resource,
        changeType,
        notificationUrl: `${this.baseNotificationUrl}/api/webhooks/graph/notifications`,
        expirationDateTime: expirationDateTime.toISOString(),
        clientState,
        latestSupportedTlsVersion: '1.2'
      };

      console.log('🔄 Creating Graph subscription:', subscription);

      // Create subscription via Microsoft Graph API
      const createdSubscription = await graphClient
        .api('/subscriptions')
        .post(subscription);

      console.log('✅ Graph subscription created:', createdSubscription);

      // Store subscription in database
      const result = await pool.query(
        `INSERT INTO graph_webhook_subscriptions 
         (subscription_id, user_id, resource, change_type, notification_url, client_state, 
          expiration_datetime, application_id, creator_id, latest_supported_tls_version, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          createdSubscription.id,
          userId,
          resource,
          changeType,
          subscription.notificationUrl,
          clientState,
          expirationDateTime,
          createdSubscription.applicationId,
          createdSubscription.creatorId,
          subscription.latestSupportedTlsVersion,
          'active'
        ]
      );

      return result.rows[0];
    } catch (error: any) {
      console.error('❌ Failed to create Graph subscription:', error);
      captureError(error, { userId, resource, changeType });
      throw new Error(`Failed to create Graph subscription: ${error.message}`);
    }
  }

  /**
   * List all subscriptions for a user
   */
  async listUserSubscriptions(userId: string): Promise<StoredSubscription[]> {
    try {
      const result = await pool.query(
        'SELECT * FROM graph_webhook_subscriptions WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      return result.rows;
    } catch (error: any) {
      console.error('❌ Failed to list user subscriptions:', error);
      captureError(error, { userId });
      throw new Error(`Failed to list subscriptions: ${error.message}`);
    }
  }

  /**
   * Get subscription by ID
   */
  async getSubscription(subscriptionId: string): Promise<StoredSubscription | null> {
    try {
      const result = await pool.query(
        'SELECT * FROM graph_webhook_subscriptions WHERE subscription_id = $1',
        [subscriptionId]
      );
      return result.rows[0] || null;
    } catch (error: any) {
      console.error('❌ Failed to get subscription:', error);
      captureError(error, { subscriptionId });
      throw new Error(`Failed to get subscription: ${error.message}`);
    }
  }

  /**
   * Delete a subscription
   */
  async deleteSubscription(userId: string, subscriptionId: string, accessToken: string): Promise<void> {
    try {
      // First verify the subscription belongs to the user
      const subscription = await pool.query(
        'SELECT * FROM graph_webhook_subscriptions WHERE subscription_id = $1 AND user_id = $2',
        [subscriptionId, userId]
      );

      if (subscription.rows.length === 0) {
        throw new Error('Subscription not found or access denied');
      }

      const graphClient = Client.init({
        authProvider: (done: any) => {
          done(null, accessToken);
        }
      });

      // Delete from Microsoft Graph
      try {
        await graphClient.api(`/subscriptions/${subscriptionId}`).delete();
        console.log('✅ Graph subscription deleted from Microsoft Graph');
      } catch (graphError: any) {
        console.warn('⚠️ Failed to delete from Graph (may already be expired):', graphError.message);
      }

      // Delete from database
      await pool.query(
        'DELETE FROM graph_webhook_subscriptions WHERE subscription_id = $1 AND user_id = $2',
        [subscriptionId, userId]
      );

      console.log('✅ Graph subscription deleted from database');
    } catch (error: any) {
      console.error('❌ Failed to delete Graph subscription:', error);
      captureError(error, { userId, subscriptionId });
      throw new Error(`Failed to delete subscription: ${error.message}`);
    }
  }

  /**
   * Renew a subscription
   */
  async renewSubscription(subscriptionId: string, accessToken: string): Promise<StoredSubscription> {
    try {
      const subscription = await this.getSubscription(subscriptionId);
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // Calculate new expiration (max 4230 minutes for mail resources)
      const newExpirationDateTime = new Date();
      newExpirationDateTime.setMinutes(newExpirationDateTime.getMinutes() + 4200); // 70 hours

      const graphClient = Client.init({
        authProvider: (done: any) => {
          done(null, accessToken);
        }
      });

      // Renew via Microsoft Graph API
      const renewedSubscription = await graphClient
        .api(`/subscriptions/${subscriptionId}`)
        .patch({
          expirationDateTime: newExpirationDateTime.toISOString()
        });

      console.log('✅ Graph subscription renewed:', renewedSubscription);

      // Update database
      const result = await pool.query(
        `UPDATE graph_webhook_subscriptions 
         SET expiration_datetime = $1, updated_at = CURRENT_TIMESTAMP
         WHERE subscription_id = $2
         RETURNING *`,
        [newExpirationDateTime, subscriptionId]
      );

      return result.rows[0];
    } catch (error: any) {
      console.error('❌ Failed to renew Graph subscription:', error);
      captureError(error, { subscriptionId });
      throw new Error(`Failed to renew subscription: ${error.message}`);
    }
  }

  /**
   * Get subscriptions that need renewal (expiring in next hour)
   */
  async getSubscriptionsNeedingRenewal(): Promise<StoredSubscription[]> {
    try {
      const oneHourFromNow = new Date();
      oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);

      const result = await pool.query(
        `SELECT * FROM graph_webhook_subscriptions 
         WHERE expiration_datetime <= $1 AND status = 'active'
         ORDER BY expiration_datetime ASC`,
        [oneHourFromNow]
      );

      return result.rows;
    } catch (error: any) {
      console.error('❌ Failed to get subscriptions needing renewal:', error);
      captureError(error);
      throw new Error(`Failed to get subscriptions needing renewal: ${error.message}`);
    }
  }

  /**
   * Mark subscription as expired
   */
  async markSubscriptionExpired(subscriptionId: string): Promise<void> {
    try {
      await pool.query(
        'UPDATE graph_webhook_subscriptions SET status = $1 WHERE subscription_id = $2',
        ['expired', subscriptionId]
      );
    } catch (error: any) {
      console.error('❌ Failed to mark subscription as expired:', error);
      captureError(error, { subscriptionId });
    }
  }

  /**
   * Store webhook event for processing
   */
  async storeWebhookEvent(
    subscriptionId: string,
    changeType: string,
    clientState: string,
    resource: string,
    resourceData?: any,
    lifecycleEvent?: string,
    tenantId?: string
  ): Promise<number> {
    try {
      const result = await pool.query(
        `INSERT INTO graph_webhook_events 
         (subscription_id, change_type, client_state, resource, resource_data, 
          lifecycle_event, tenant_id, event_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          subscriptionId,
          changeType,
          clientState,
          resource,
          resourceData ? JSON.stringify(resourceData) : null,
          lifecycleEvent,
          tenantId,
          new Date()
        ]
      );

      return result.rows[0].id;
    } catch (error: any) {
      console.error('❌ Failed to store webhook event:', error);
      captureError(error, { subscriptionId, changeType, resource });
      throw new Error(`Failed to store webhook event: ${error.message}`);
    }
  }

  /**
   * Mark webhook event as processed
   */
  async markEventProcessed(eventId: number, success: boolean, errorMessage?: string): Promise<void> {
    try {
      await pool.query(
        `UPDATE graph_webhook_events 
         SET processed = $1, processed_at = CURRENT_TIMESTAMP, error_message = $2
         WHERE id = $3`,
        [success, errorMessage || null, eventId]
      );
    } catch (error: any) {
      console.error('❌ Failed to mark event as processed:', error);
      captureError(error, { eventId, success, errorMessage });
    }
  }

  /**
   * Get unprocessed events
   */
  async getUnprocessedEvents(limit: number = 100): Promise<any[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM graph_webhook_events 
         WHERE processed = FALSE AND retry_count < 3
         ORDER BY event_time ASC
         LIMIT $1`,
        [limit]
      );
      return result.rows;
    } catch (error: any) {
      console.error('❌ Failed to get unprocessed events:', error);
      captureError(error);
      throw new Error(`Failed to get unprocessed events: ${error.message}`);
    }
  }

  /**
   * Increment retry count for failed event
   */
  async incrementEventRetryCount(eventId: number): Promise<void> {
    try {
      await pool.query(
        'UPDATE graph_webhook_events SET retry_count = retry_count + 1 WHERE id = $1',
        [eventId]
      );
    } catch (error: any) {
      console.error('❌ Failed to increment retry count:', error);
      captureError(error, { eventId });
    }
  }
}

export const graphWebhookService = GraphWebhookService.getInstance();
