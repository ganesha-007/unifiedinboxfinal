const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'whatsapp_integration',
  user: 'ganeshmuthukaruppan',
  password: '',
});

async function fixUser123() {
  try {
    console.log('🔧 Fixing user_123 credentials...');
    
    const sql = `
      INSERT INTO user_credentials (user_id, unipile_api_key, unipile_api_url)
      VALUES ('user_123', 'sMk7/9XI.mQobpR8vUQXfkfCzTenPhVM9zrb7CAAlJgdV4kev6jY=', 'https://api14.unipile.com:14429/api/v1')
      ON CONFLICT (user_id) DO UPDATE 
      SET 
        unipile_api_key = EXCLUDED.unipile_api_key,
        unipile_api_url = EXCLUDED.unipile_api_url,
        updated_at = CURRENT_TIMESTAMP;
    `;
    
    await pool.query(sql);
    
    console.log('✅ user_123 credentials fixed successfully');
    
    // Verify
    const result = await pool.query(
      'SELECT user_id, unipile_api_key, unipile_api_url, gmail_email FROM user_credentials WHERE user_id = $1',
      ['user_123']
    );
    
    console.log('📋 Verification:', result.rows[0]);
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed:', error.message);
    await pool.end();
    process.exit(1);
  }
}

fixUser123();

