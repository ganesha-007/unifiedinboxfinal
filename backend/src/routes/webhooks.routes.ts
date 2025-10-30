import { Router } from 'express';
import {
  handleUniPileMessage,
  handleUniPileAccountStatus,
  checkDataConsistency,
} from '../controllers/webhooks.controller';
import {
  handleGmailWebhook,
  setupGmailWatch,
} from '../controllers/gmail-webhook.controller';
import { verifyWebhookSignature } from '../middleware/webhookAuth';
import { validateWebhookPayloadWithLogging } from '../middleware/webhookValidation';
import {
  unipileMessageRateLimiter,
  unipileAccountRateLimiter,
  gmailWebhookRateLimiter,
} from '../middleware/webhookRateLimit';
import graphWebhookRoutes from './graphWebhook.routes';

const router = Router();

// UniPile webhooks with rate limiting, signature verification, and payload validation
router.post('/unipile/messages', unipileMessageRateLimiter, verifyWebhookSignature, validateWebhookPayloadWithLogging, handleUniPileMessage);
router.get('/unipile/messages', (req, res) => {
  console.log('🔐 Webhook verification GET request received');
  res.json({ status: 'webhook endpoint active' });
});
router.post('/unipile/account-status', unipileAccountRateLimiter, verifyWebhookSignature, validateWebhookPayloadWithLogging, handleUniPileAccountStatus);

// Gmail webhooks with rate limiting and payload validation (Pub/Sub handles authentication)
router.post('/gmail/messages', gmailWebhookRateLimiter, validateWebhookPayloadWithLogging, handleGmailWebhook);
router.post('/gmail/setup-watch', setupGmailWatch);

// Microsoft Graph webhooks
router.use('/graph', graphWebhookRoutes);

// Data consistency check (for debugging)
router.get('/consistency-check', checkDataConsistency);

export default router;

