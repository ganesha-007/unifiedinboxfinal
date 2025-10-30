import dotenv from 'dotenv';

dotenv.config();

// Stripe secret and webhook secret loaded from env
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// Frontend URLs for checkout/portal callbacks
export const CHECKOUT_SUCCESS_URL = process.env.CHECKOUT_SUCCESS_URL || 'http://localhost:3000/billing/success';
export const CHECKOUT_CANCEL_URL = process.env.CHECKOUT_CANCEL_URL || 'http://localhost:3000/billing/cancel';
export const PORTAL_RETURN_URL = process.env.PORTAL_RETURN_URL || 'http://localhost:3000/settings/billing';

// Price ID mapping from environment variables
export const PRICES = {
  starterMonthly: process.env.STARTER_MONTHLY_PRICE_ID || '',
  growthMonthly: process.env.GROWTH_MONTHLY_PRICE_ID || '',
  scaleMonthly: process.env.SCALE_MONTHLY_PRICE_ID || '',
  addonWhatsappMonthly: process.env.ADDON_WHATSAPP_MONTHLY_PRICE_ID || '',
  addonInstagramMonthly: process.env.ADDON_INSTAGRAM_MONTHLY_PRICE_ID || '',
  addonEmailMonthly: process.env.ADDON_EMAIL_MONTHLY_PRICE_ID || '',
};

// Map price IDs back to internal plan/addon codes
export type PlanCode = 'starter' | 'growth' | 'scale';
export type AddonCode = 'whatsapp' | 'instagram' | 'email';

export function mapPriceToPlanOrAddon(priceId: string): { type: 'plan' | 'addon'; code: PlanCode | AddonCode } | null {
  switch (priceId) {
    case PRICES.starterMonthly: return { type: 'plan', code: 'starter' };
    case PRICES.growthMonthly: return { type: 'plan', code: 'growth' };
    case PRICES.scaleMonthly: return { type: 'plan', code: 'scale' };
    case PRICES.addonWhatsappMonthly: return { type: 'addon', code: 'whatsapp' };
    case PRICES.addonInstagramMonthly: return { type: 'addon', code: 'instagram' };
    case PRICES.addonEmailMonthly: return { type: 'addon', code: 'email' };
    default: return null;
  }
}

export function getPlanIncludedProviders(plan: PlanCode): AddonCode[] {
  if (plan === 'starter') return [];
  if (plan === 'growth') return [];
  // scale includes all
  return ['whatsapp', 'instagram', 'email'];
}



