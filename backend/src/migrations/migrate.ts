import { readFileSync } from 'fs';
import { join } from 'path';
import { pool } from '../config/database';

async function runMigrations() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    console.log('🔄 Running database migrations...');
    
    // List all migration files in order
    const migrations = [
      '001_initial_schema.sql',
      '002_add_external_account_constraint.sql',
      '003_add_user_credentials.sql',
      '004_add_gmail_credentials.sql',
      '005_add_outlook_credentials.sql',
      '006_fix_outlook_schema.sql',
      '007_add_gmail_watch_expiry.sql',
      '009_add_email_rate_limiting.sql',
      '010_add_bounce_complaint_tracking.sql',
      '011_add_billing_customers.sql',
      '012_billing_core.sql',
      '013_analytics_events.sql',
      '013_workspace_settings.sql',
      '014_graph_webhook_subscriptions.sql',
      '014_limiter_events.sql',
    ];
    
    for (const migrationFile of migrations) {
      try {
        const migrationPath = join(__dirname, migrationFile);
        const migrationSQL = readFileSync(migrationPath, 'utf-8');
        console.log(`  Running ${migrationFile}...`);
        await client.query(migrationSQL);
        console.log(`  ✅ ${migrationFile} completed`);
      } catch (error: any) {
        // If file doesn't exist, skip it (for optional migrations)
        if (error.code === 'ENOENT') {
          console.log(`  ⚠️  ${migrationFile} not found, skipping...`);
          continue;
        }
        // If it's a "already exists" error, that's okay for CREATE TABLE IF NOT EXISTS
        if (error.message && error.message.includes('already exists')) {
          console.log(`  ℹ️  ${migrationFile} - objects already exist, skipping...`);
          continue;
        }
        throw error;
      }
    }
    
    await client.query('COMMIT');
    console.log('✅ All migrations completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((error) => {
  console.error('❌ Fatal migration error:', error);
  process.exit(1);
});
