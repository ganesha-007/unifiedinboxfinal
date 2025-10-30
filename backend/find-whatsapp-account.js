const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'whatsapp_integration',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function findWhatsAppAccount(phoneNumber) {
  console.log(`\n🔍 Searching for WhatsApp account associated with: ${phoneNumber}\n`);
  
  try {
    // Normalize phone number variations
    const phoneVariations = [
      phoneNumber,
      `+${phoneNumber}`,
      `91${phoneNumber}`,
      `+91${phoneNumber}`,
      `${phoneNumber}@s.whatsapp.net`,
      `91${phoneNumber}@s.whatsapp.net`,
      `+91${phoneNumber}@s.whatsapp.net`
    ];
    
    console.log('📋 Checking phone number variations:', phoneVariations.join(', '));
    
    // 1. Check user_credentials table
    console.log('\n1️⃣ Checking user_credentials table...');
    const credentialsQuery = `
      SELECT user_id, whatsapp_phone_number, unipile_api_key, webhook_url, created_at
      FROM user_credentials
      WHERE whatsapp_phone_number LIKE $1 
         OR whatsapp_phone_number LIKE $2
         OR whatsapp_phone_number LIKE $3
         OR whatsapp_phone_number LIKE $4
         OR whatsapp_phone_number LIKE $5
         OR whatsapp_phone_number LIKE $6
         OR whatsapp_phone_number LIKE $7
    `;
    
    const credentialsResult = await pool.query(credentialsQuery, [
      `%${phoneNumber}%`,
      `%91${phoneNumber}%`,
      `%+91${phoneNumber}%`,
      `%${phoneNumber}@s.whatsapp.net%`,
      `%91${phoneNumber}@s.whatsapp.net%`,
      `%+91${phoneNumber}@s.whatsapp.net%`,
      `%${phoneNumber.substring(phoneNumber.length - 10)}%` // Last 10 digits
    ]);
    
    if (credentialsResult.rows.length > 0) {
      console.log(`✅ Found ${credentialsResult.rows.length} user credential(s):`);
      credentialsResult.rows.forEach((row, index) => {
        console.log(`\n   User ${index + 1}:`);
        console.log(`   - User ID: ${row.user_id}`);
        console.log(`   - WhatsApp Phone: ${row.whatsapp_phone_number}`);
        console.log(`   - Created At: ${row.created_at}`);
      });
    } else {
      console.log('   ❌ No matching user credentials found');
    }
    
    // 2. Check channels_account table for WhatsApp accounts
    console.log('\n2️⃣ Checking channels_account table for WhatsApp accounts...');
    const accountsQuery = `
      SELECT 
        ca.id,
        ca.user_id,
        ca.provider,
        ca.external_account_id,
        ca.status,
        ca.metadata,
        ca.created_at,
        ca.updated_at
      FROM channels_account ca
      WHERE ca.provider = 'whatsapp'
      ORDER BY ca.created_at DESC
    `;
    
    const accountsResult = await pool.query(accountsQuery);
    
    if (accountsResult.rows.length > 0) {
      console.log(`✅ Found ${accountsResult.rows.length} WhatsApp account(s) in database:`);
      
      for (const account of accountsResult.rows) {
        console.log(`\n   Account ID: ${account.external_account_id}`);
        console.log(`   - User ID: ${account.user_id}`);
        console.log(`   - Status: ${account.status}`);
        console.log(`   - Created At: ${account.created_at}`);
        
        // Check metadata for phone number
        if (account.metadata) {
          const metadata = typeof account.metadata === 'string' 
            ? JSON.parse(account.metadata) 
            : account.metadata;
          
          console.log(`   - Metadata:`, JSON.stringify(metadata, null, 2));
          
          // Check if phone number matches
          const metadataStr = JSON.stringify(metadata).toLowerCase();
          const phoneLower = phoneNumber.toLowerCase();
          
          if (metadataStr.includes(phoneLower) || 
              metadataStr.includes(phoneLower.substring(phoneLower.length - 10))) {
            console.log(`   ✅ ⭐ MATCH FOUND IN METADATA! ⭐`);
          }
        }
      }
    } else {
      console.log('   ❌ No WhatsApp accounts found in database');
    }
    
    // 3. Check channels_chat table for chats with this phone number
    console.log('\n3️⃣ Checking channels_chat table for chats with this phone number...');
    const chatsQuery = `
      SELECT 
        cc.id,
        cc.account_id,
        cc.provider_chat_id,
        cc.title,
        cc.metadata,
        ca.user_id,
        ca.external_account_id
      FROM channels_chat cc
      JOIN channels_account ca ON cc.account_id = ca.id
      WHERE ca.provider = 'whatsapp'
        AND (
          cc.provider_chat_id LIKE $1
          OR cc.provider_chat_id LIKE $2
          OR cc.provider_chat_id LIKE $3
          OR cc.metadata::text LIKE $4
        )
      ORDER BY cc.last_message_at DESC
      LIMIT 10
    `;
    
    const chatsResult = await pool.query(chatsQuery, [
      `%${phoneNumber}%`,
      `%91${phoneNumber}%`,
      `%${phoneNumber}@s.whatsapp.net%`,
      `%${phoneNumber.substring(phoneNumber.length - 10)}%`
    ]);
    
    if (chatsResult.rows.length > 0) {
      console.log(`✅ Found ${chatsResult.rows.length} chat(s) with this phone number:`);
      chatsResult.rows.forEach((chat, index) => {
        console.log(`\n   Chat ${index + 1}:`);
        console.log(`   - Chat ID: ${chat.provider_chat_id}`);
        console.log(`   - Account ID: ${chat.external_account_id}`);
        console.log(`   - User ID: ${chat.user_id}`);
        console.log(`   - Title: ${chat.title || 'N/A'}`);
        if (chat.metadata) {
          console.log(`   - Metadata:`, JSON.stringify(chat.metadata, null, 2));
        }
      });
    } else {
      console.log('   ❌ No chats found with this phone number');
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    
    if (credentialsResult.rows.length > 0) {
      console.log(`\n✅ User Account(s) found:`);
      credentialsResult.rows.forEach(row => {
        console.log(`   - User ID: ${row.user_id}`);
        console.log(`   - WhatsApp Phone: ${row.whatsapp_phone_number}`);
      });
    }
    
    if (accountsResult.rows.length > 0) {
      console.log(`\n✅ WhatsApp Account(s) in channels_account:`);
      accountsResult.rows.forEach(acc => {
        console.log(`   - External Account ID: ${acc.external_account_id}`);
        console.log(`   - User ID: ${acc.user_id}`);
        console.log(`   - Status: ${acc.status}`);
      });
    }
    
    if (chatsResult.rows.length > 0) {
      console.log(`\n✅ Chat(s) found:`);
      const uniqueUserIds = [...new Set(chatsResult.rows.map(c => c.user_id))];
      uniqueUserIds.forEach(userId => {
        console.log(`   - User ID: ${userId}`);
      });
    }
    
    if (credentialsResult.rows.length === 0 && accountsResult.rows.length === 0 && chatsResult.rows.length === 0) {
      console.log('\n❌ No account found associated with this phone number');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

// Run the search
const phoneNumber = process.argv[2] || '9566651479';
findWhatsAppAccount(phoneNumber);

