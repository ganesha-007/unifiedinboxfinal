import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  validateGraphWebhook,
  handleGraphWebhookNotifications,
  createGraphSubscription,
  listGraphSubscriptions,
  deleteGraphSubscription,
  renewGraphSubscription,
  getGraphWebhookStats
} from '../controllers/graphWebhook.controller';

const router = Router();

// Public webhook endpoints (Microsoft Graph calls these)
// Validation endpoint - Microsoft Graph sends GET request during subscription creation
router.get('/notifications', validateGraphWebhook);

// Notification endpoint - Microsoft Graph sends POST requests with notifications
router.post('/notifications', handleGraphWebhookNotifications);

// Authenticated endpoints for subscription management
router.post('/subscriptions', authenticate, createGraphSubscription);
router.get('/subscriptions', authenticate, listGraphSubscriptions);
router.delete('/subscriptions/:subscriptionId', authenticate, deleteGraphSubscription);
router.patch('/subscriptions/:subscriptionId/renew', authenticate, renewGraphSubscription);
router.get('/stats', authenticate, getGraphWebhookStats);

export default router;
