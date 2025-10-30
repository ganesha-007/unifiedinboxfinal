-- Core billing tables
CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  plan_code TEXT,
  status TEXT,
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS billing_subscription_items (
  id SERIAL PRIMARY KEY,
  stripe_subscription_id TEXT NOT NULL,
  stripe_price_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  item_code TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id SERIAL PRIMARY KEY,
  stripe_invoice_id TEXT UNIQUE NOT NULL,
  user_id TEXT,
  status TEXT,
  total BIGINT,
  created TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS billing_payments (
  id SERIAL PRIMARY KEY,
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_charge_id TEXT,
  user_id TEXT,
  amount BIGINT,
  status TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS billing_webhook_events (
  id SERIAL PRIMARY KEY,
  event_id TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

