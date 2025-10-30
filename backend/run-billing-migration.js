const { Pool } = require('pg');
require('dotenv').config();

(async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'whatsapp_integration',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS billing_customers (
      user_id TEXT PRIMARY KEY,
      stripe_customer_id TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`);
    console.log('✅ billing_customers ready');
  } catch (e) {
    console.error('❌ Billing migration failed', e);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();

