import { pool } from '../config/database';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
  try {
    console.log('🔧 Fixing user_123 credentials...');
    
    const sql = fs.readFileSync(
      path.join(__dirname, '008_fix_user_123_credentials.sql'),
      'utf8'
    );
    
    await pool.query(sql);
    
    console.log('✅ user_123 credentials fixed successfully');
    
    // Verify
    const result = await pool.query(
      'SELECT user_id, unipile_api_key, unipile_api_url, gmail_email FROM user_credentials WHERE user_id = $1',
      ['user_123']
    );
    
    console.log('📋 Verification:', result.rows[0]);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();

