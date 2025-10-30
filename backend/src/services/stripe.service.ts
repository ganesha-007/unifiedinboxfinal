import Stripe from 'stripe';
import { STRIPE_SECRET_KEY } from '../config/billing';

// Initialize Stripe client (types included in SDK)
export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2025-10-29.clover' as any,
});



