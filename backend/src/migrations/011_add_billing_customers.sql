-- Basic table to map application users to Stripe customers
CREATE TABLE IF NOT EXISTS billing_customers (
  user_id TEXT PRIMARY KEY,
  stripe_customer_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);



