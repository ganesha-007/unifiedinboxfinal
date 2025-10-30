const crypto = require('crypto');
const axios = require('axios');

// Comprehensive test to trigger rate limit
const WEBHOOK_SECRET = 'test_secret_key_123';
const BASE_URL = 'http://localhost:3001/api/webhooks';

// Generate HMAC-SHA256 signature
function generateSignature(payload, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex');
}

const testPayload = {
  event: 'message.new',
  data: {
    account_id: 'test_account_123',
    chat_id: 'test_chat_456',
    message: {
      id: 'test_msg_789',
      from: {
        name: 'Test User',
        phone: '+1234567890'
      },
      body: 'Test message for rate limiting',
      timestamp: new Date().toISOString(),
      attachments: []
    }
  }
};

async function makeRequest(endpoint, payload) {
  try {
    const signature = generateSignature(payload, WEBHOOK_SECRET);
    
    const response = await axios.post(`${BASE_URL}${endpoint}`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-UniPile-Signature': signature
      },
      validateStatus: () => true
    });
    
    return {
      status: response.status,
      headers: response.headers,
      data: response.data
    };
  } catch (error) {
    if (error.response) {
      return {
        status: error.response.status,
        headers: error.response.headers,
        data: error.response.data
      };
    }
    throw error;
  }
}

async function testRateLimitTriggering() {
  console.log('🚀 Comprehensive Rate Limit Test');
  console.log('='.repeat(60));
  console.log('📝 Sending requests to trigger rate limit (100/min limit)');
  console.log('   This will send 105 requests rapidly...\n');
  
  const results = [];
  let rateLimitTriggered = false;
  let rateLimitIndex = -1;
  
  // Send 105 requests rapidly (5 over the limit)
  for (let i = 0; i < 105; i++) {
    const result = await makeRequest('/unipile/messages', testPayload);
    results.push(result);
    
    // Check if we hit rate limit
    if (result.status === 429 && !rateLimitTriggered) {
      rateLimitTriggered = true;
      rateLimitIndex = i;
    }
    
    // Show progress every 10 requests
    if ((i + 1) % 10 === 0) {
      process.stdout.write(`\n   ${i + 1}/105 requests sent... `);
      const recentStatuses = results.slice(-10).map(r => r.status);
      const status200 = recentStatuses.filter(s => s === 200 || s === 500).length;
      const status429 = recentStatuses.filter(s => s === 429).length;
      process.stdout.write(`✅ ${status200} passed, ❌ ${status429} rate limited`);
    } else {
      const icon = result.status === 429 ? '❌' : (result.status === 200 || result.status === 500 ? '✅' : '⚠️');
      process.stdout.write(icon);
    }
    
    // Small delay to avoid overwhelming
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  console.log('\n\n📊 Results:');
  const statusCounts = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  
  Object.entries(statusCounts).forEach(([status, count]) => {
    const percentage = ((count / results.length) * 100).toFixed(1);
    console.log(`   Status ${status}: ${count} requests (${percentage}%)`);
  });
  
  if (rateLimitTriggered) {
    console.log(`\n✅ Rate limit triggered at request #${rateLimitIndex + 1}`);
    console.log(`   This means rate limiting is working correctly!`);
    
    // Show rate limit response details
    const rateLimitResponse = results[rateLimitIndex];
    console.log(`\n📋 Rate Limit Response:`);
    console.log(`   Status: ${rateLimitResponse.status}`);
    console.log(`   Message: ${rateLimitResponse.data?.message || rateLimitResponse.data?.error || 'N/A'}`);
    console.log(`   Retry After: ${rateLimitResponse.data?.retryAfter || 'N/A'} seconds`);
    
    if (rateLimitResponse.headers['ratelimit-limit']) {
      console.log(`\n📊 Rate Limit Headers:`);
      console.log(`   - Limit: ${rateLimitResponse.headers['ratelimit-limit']}`);
      console.log(`   - Remaining: ${rateLimitResponse.headers['ratelimit-remaining']}`);
      console.log(`   - Reset: ${rateLimitResponse.headers['ratelimit-reset']}`);
    }
    
    return true;
  } else {
    console.log(`\n⚠️  Rate limit not triggered with 105 requests`);
    console.log(`   This might mean:`);
    console.log(`   1. Rate limiter is using a different tracking method`);
    console.log(`   2. Requests are being spread across different time windows`);
    console.log(`   3. Rate limit window has reset during test`);
    
    // Check if we got any 429s at all
    const has429 = results.some(r => r.status === 429);
    if (has429) {
      console.log(`   ✅ However, some requests were rate limited, so rate limiting is active!`);
      return true;
    } else {
      return false;
    }
  }
}

// Run the test
testRateLimitTriggering().catch(console.error);

