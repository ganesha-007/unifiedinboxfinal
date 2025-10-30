import { Request, Response } from 'express';
import Stripe from 'stripe';
import { stripe } from '../services/stripe.service';
import { pool } from '../config/database';
import { STRIPE_WEBHOOK_SECRET, CHECKOUT_SUCCESS_URL, CHECKOUT_CANCEL_URL, PORTAL_RETURN_URL, mapPriceToPlanOrAddon, getPlanIncludedProviders, PRICES } from '../config/billing';
import { entitlementsCache } from '../services/entitlementsCache';

// Ensure a Stripe customer exists for a given user id
async function getOrCreateCustomerId(userId: string): Promise<string> {
  const existing = await pool.query('SELECT stripe_customer_id FROM billing_customers WHERE user_id = $1', [userId]);
  if (existing.rows[0]?.stripe_customer_id) return existing.rows[0].stripe_customer_id;

  const customer = await stripe.customers.create({ metadata: { userId } });
  await pool.query(
    'INSERT INTO billing_customers(user_id, stripe_customer_id) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id',
    [userId, customer.id]
  );
  return customer.id;
}

export async function createCheckoutSession(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id || req.body.userId; // dev fallback
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    let { priceIds } = req.body as { priceIds: string[] };
    if (!Array.isArray(priceIds) || priceIds.length === 0) {
      // Default to Starter plan when none provided (useful for simple Upgrade buttons)
      priceIds = [PRICES.starterMonthly].filter(Boolean);
    }

    const customerId = await getOrCreateCustomerId(userId);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: priceIds.map((price) => ({ price, quantity: 1 })),
      success_url: CHECKOUT_SUCCESS_URL,
      cancel_url: CHECKOUT_CANCEL_URL,
      allow_promotion_codes: true,
      client_reference_id: userId,
    });

    return res.json({ id: session.id, url: session.url });
  } catch (error: any) {
    console.error('createCheckoutSession error', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}

export async function createPortalSession(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id || req.body.userId; // dev fallback
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const customerId = await getOrCreateCustomerId(userId);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: PORTAL_RETURN_URL,
    });
    return res.json({ url: session.url });
  } catch (error) {
    console.error('createPortalSession error', error);
    return res.status(500).json({ error: 'Failed to create portal session' });
  }
}

// Helper to upsert entitlements based on selected plan/addons
async function syncEntitlementsForSubscription(userId: string, activePriceIds: string[]) {
  // Determine chosen plan and addons
  let plan: 'starter' | 'growth' | 'scale' | null = null;
  const addons = new Set<string>();
  for (const pid of activePriceIds) {
    const map = mapPriceToPlanOrAddon(pid);
    if (!map) continue;
    if (map.type === 'plan') plan = map.code as any;
    if (map.type === 'addon') addons.add(map.code);
  }

  const providers = new Set<string>();
  if (plan) getPlanIncludedProviders(plan).forEach((p) => providers.add(p));
  addons.forEach((a) => providers.add(a));

  // Upsert entitlements per provider
  for (const provider of ['whatsapp', 'instagram', 'email']) {
    const isActive = providers.has(provider);
    await pool.query(
      `INSERT INTO channels_entitlement (user_id, provider, is_active, source)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, provider)
       DO UPDATE SET is_active = EXCLUDED.is_active, updated_at = CURRENT_TIMESTAMP`,
      [userId, provider, isActive, 'plan']
    );
  }
}

export async function stripeWebhook(req: Request, res: Response) {
  const sig = req.headers['stripe-signature'] as string;
  if (!STRIPE_WEBHOOK_SECRET) return res.status(500).send('Webhook secret not configured');

  let event: Stripe.Event;
  try {
    const raw = (req as any).rawBody || (req as any).body; // raw body supplied by route-level middleware
    event = stripe.webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error('❌ Webhook signature verification failed', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        // No-op: subscription events will follow with definitive state
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as any;
        const customerId: string = subscription.customer;
        const userRes = await pool.query('SELECT user_id FROM billing_customers WHERE stripe_customer_id = $1', [customerId]);
        const userId = userRes.rows[0]?.user_id;
        if (!userId) break;
        const activePriceIds: string[] = (subscription.items?.data || []).map((i: any) => i.price?.id).filter(Boolean);
        // Persist subscription core state
        const planItem = activePriceIds.map(mapPriceToPlanOrAddon).find((m) => m && m.type === 'plan') as any;
        await pool.query(
          `INSERT INTO billing_subscriptions (user_id, stripe_subscription_id, plan_code, status, current_period_start, current_period_end)
           VALUES ($1, $2, $3, $4, to_timestamp($5), to_timestamp($6))
           ON CONFLICT (stripe_subscription_id)
           DO UPDATE SET plan_code = EXCLUDED.plan_code, status = EXCLUDED.status, current_period_start = EXCLUDED.current_period_start, current_period_end = EXCLUDED.current_period_end, updated_at = CURRENT_TIMESTAMP`,
          [userId, subscription.id, planItem ? planItem.code : null, subscription.status, subscription.current_period_start, subscription.current_period_end]
        );
        // Refresh items mapping
        await pool.query('DELETE FROM billing_subscription_items WHERE stripe_subscription_id = $1', [subscription.id]);
        for (const pid of activePriceIds) {
          const map = mapPriceToPlanOrAddon(pid) as any;
          await pool.query(
            'INSERT INTO billing_subscription_items (stripe_subscription_id, stripe_price_id, item_type, item_code) VALUES ($1,$2,$3,$4)',
            [subscription.id, pid, map?.type || 'unknown', map?.code || null]
          );
        }
        await syncEntitlementsForSubscription(userId, activePriceIds);
        entitlementsCache.invalidate(userId);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;
        const customerId: string = subscription.customer;
        const userRes = await pool.query('SELECT user_id FROM billing_customers WHERE stripe_customer_id = $1', [customerId]);
        const userId = userRes.rows[0]?.user_id;
        if (!userId) break;
        // Disable all entitlements on cancel
        await pool.query(
          `UPDATE channels_entitlement SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
          [userId]
        );
        await pool.query('UPDATE billing_subscriptions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = $2', ['canceled', subscription.id]);
        entitlementsCache.invalidate(userId);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as any;
        const customerId: string = invoice.customer;
        const userRes = await pool.query('SELECT user_id FROM billing_customers WHERE stripe_customer_id = $1', [customerId]);
        const userId = userRes.rows[0]?.user_id;
        await pool.query(
          `INSERT INTO billing_invoices (stripe_invoice_id, user_id, status, total, created)
           VALUES ($1,$2,$3,$4,to_timestamp($5))
           ON CONFLICT (stripe_invoice_id) DO UPDATE SET status = EXCLUDED.status`,
          [invoice.id, userId || null, invoice.status, invoice.total || 0, invoice.created]
        );
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as any;
        await pool.query(
          `INSERT INTO billing_invoices (stripe_invoice_id, user_id, status, total, created)
           VALUES ($1,NULL,$2,$3,to_timestamp($4))
           ON CONFLICT (stripe_invoice_id) DO UPDATE SET status = EXCLUDED.status`,
          [invoice.id, invoice.status, invoice.total || 0, invoice.created]
        );
        break;
      }
      default:
        // Unhandled event types are ignored but acknowledged
        break;
    }
    res.json({ received: true });
  } catch (error) {
    console.error('⚠️ Webhook handler error', error);
    return res.status(500).send('handler error');
  }
}

export async function getSubscriptionStatus(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id || (req.query.userId as string);
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const r = await pool.query(
      `SELECT * FROM billing_subscriptions WHERE user_id = $1 ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT 1`,
      [userId]
    );
    return res.json(r.rows[0] || null);
  } catch (e) {
    console.error('getSubscriptionStatus error', e);
    return res.status(500).json({ error: 'Failed to get subscription status' });
  }
}


