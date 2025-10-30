import express, { Router } from 'express';
import { createCheckoutSession, createPortalSession, stripeWebhook, getSubscriptionStatus } from '../controllers/billing.controller';
import { pool } from '../config/database';

const router = Router();

// Public for local testing; controller uses req.user or req.body.userId
router.post('/checkout/session', createCheckoutSession);
router.post('/portal/session', createPortalSession);
router.get('/subscription', getSubscriptionStatus);

// Stripe webhook must use raw body for signature verification
router.post('/stripe', express.raw({ type: 'application/json' }), (req, res) => stripeWebhook(req as any, res));

// Temporary debug route: fetch stripe customer mapping
router.get('/debug/customer/:userId', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM billing_customers WHERE user_id = $1', [req.params.userId]);
    res.json(r.rows[0] || null);
  } catch (e) {
    res.status(500).json({ error: 'debug failed' });
  }
});

export default router;


