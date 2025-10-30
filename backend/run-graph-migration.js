const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'whatsapp_integration',
  user: process.env.DB_USER || 'ganeshmuthukaruppan',
  password: process.env.DB_PASSWORD || '',
});

async function runGraphMigration() {
  try {
    console.log('✅ Connected to PostgreSQL database');
    
    // Read the Graph webhook migration file
    const migrationPath = path.join(__dirname, 'src/migrations/014_graph_webhook_subscriptions.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('🔄 Running Graph webhook migration...');
    
    // Execute the migration
    await pool.query(migrationSQL);
    
    console.log('✅ Graph webhook migration completed successfully');
  } catch (error) {
    console.error('❌ Graph webhook migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

runGraphMigration();
