import { Router } from 'express';
import {
  handleBounceWebhook,
  handleComplaintWebhook,
  getBounceStats,
  getComplaintStats,
  getReputation
} from '../controllers/bounceComplaint.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public webhook endpoints (no authentication required for webhooks)
router.post('/bounce', handleBounceWebhook);
router.post('/complaint', handleComplaintWebhook);

// Authenticated endpoints for viewing statistics
router.get('/bounces', authenticate, getBounceStats);
router.get('/complaints', authenticate, getComplaintStats);
router.get('/reputation', authenticate, getReputation);

export default router;

