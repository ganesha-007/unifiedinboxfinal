const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'whatsapp_integration',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running bounce/complaint tracking migration...');
    
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'src/migrations/010_add_bounce_complaint_tracking.sql'),
      'utf8'
    );
    
    await client.query('BEGIN');
    await client.query(migrationSQL);
    await client.query('COMMIT');
    
    console.log('✅ Migration completed successfully');
    
    // Verify tables were created
    const tablesCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('email_bounces', 'email_complaints', 'email_reputation')
      ORDER BY table_name
    `);
    
    console.log('📊 Created tables:', tablesCheck.rows.map((r) => r.table_name).join(', '));
    
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '42P07') { // Table already exists
      console.log('⚠️  Tables already exist, skipping migration');
    } else {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch((error) => {
  console.error('Migration error:', error);
  process.exit(1);
});