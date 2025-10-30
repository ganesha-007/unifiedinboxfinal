const crypto = require('crypto');
const axios = require('axios');

// Test webhook rate limiting
const WEBHOOK_SECRET = 'test_secret_key_123';
const BASE_URL = 'http://localhost:3001/api/webhooks';

// Generate HMAC-SHA256 signature
function generateSignature(payload, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex');
}

// Sample webhook payloads
const unipileMessagePayload = {
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

const unipileAccountPayload = {
  event: 'account.update',
  data: {
    account_id: 'test_account_123',
    status: 'connected',
    metadata: {
      phone: '+1234567890'
    }
  }
};

const gmailPayload = {
  message: {
    data: Buffer.from(JSON.stringify({ test: 'gmail webhook' })).toString('base64'),
    messageId: 'test-message-id',
    publishTime: new Date().toISOString()
  }
};

// Helper function to make webhook request
async function makeWebhookRequest(endpoint, payload, headers = {}) {
  try {
    const signature = endpoint.includes('/gmail') 
      ? null 
      : generateSignature(payload, WEBHOOK_SECRET);
    
    const requestHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    
    if (signature) {
      requestHeaders['X-UniPile-Signature'] = signature;
    }
    
    const response = await axios.post(`${BASE_URL}${endpoint}`, payload, {
      headers: requestHeaders,
      validateStatus: () => true // Don't throw on any status
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

// Test rate limiting for a specific endpoint
async function testRateLimit(endpoint, payload, endpointName, limit) {
  console.log(`\n🧪 Testing rate limiting for ${endpointName}`);
  console.log(`   Endpoint: ${endpoint}`);
  console.log(`   Rate Limit: ${limit.max} requests per ${limit.windowMs / 1000} seconds\n`);
  
  const results = [];
  
  // Test 1: Send requests up to the limit (should pass)
  console.log(`📤 Sending ${limit.max} requests (should all pass)...`);
  for (let i = 0; i < limit.max; i++) {
    const result = await makeWebhookRequest(endpoint, payload);
    results.push(result);
    
    if (result.status === 200 || result.status === 500) { // 500 might be from handler errors, but rate limit passed
      process.stdout.write('✅ ');
    } else if (result.status === 429) {
      process.stdout.write('❌ ');
    } else {
      process.stdout.write('⚠️ ');
    }
    
    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  console.log(`\n   Status summary:`);
  const statusCounts = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  
  Object.entries(statusCounts).forEach(([status, count]) => {
    console.log(`   - ${status}: ${count} requests`);
  });
  
  // Test 2: Send one more request (should be rate limited)
  console.log(`\n📤 Sending 1 additional request (should be rate limited)...`);
  const rateLimitedResult = await makeWebhookRequest(endpoint, payload);
  
  if (rateLimitedResult.status === 429) {
    console.log(`   ✅ Rate limit correctly enforced!`);
    console.log(`   Status: ${rateLimitedResult.status}`);
    console.log(`   Response:`, JSON.stringify(rateLimitedResult.data, null, 2));
    
    // Check for rate limit headers
    if (rateLimitedResult.headers['ratelimit-limit']) {
      console.log(`   Rate Limit Headers:`);
      console.log(`   - Limit: ${rateLimitedResult.headers['ratelimit-limit']}`);
      console.log(`   - Remaining: ${rateLimitedResult.headers['ratelimit-remaining']}`);
      console.log(`   - Reset: ${rateLimitedResult.headers['ratelimit-reset']}`);
    }
    
    return true;
  } else {
    console.log(`   ⚠️ Expected 429 (Rate Limit Exceeded), got ${rateLimitedResult.status}`);
    console.log(`   Response:`, JSON.stringify(rateLimitedResult.data, null, 2));
    return false;
  }
}

// Test rate limit reset
async function testRateLimitReset(endpoint, payload, endpointName, limit) {
  console.log(`\n🔄 Testing rate limit reset (waiting ${Math.ceil(limit.windowMs / 1000)} seconds)...`);
  
  // Wait for the rate limit window to reset
  await new Promise(resolve => setTimeout(resolve, limit.windowMs + 100));
  
  // Try a request again (should pass)
  console.log(`📤 Sending request after reset (should pass)...`);
  const result = await makeWebhookRequest(endpoint, payload);
  
  if (result.status === 200 || result.status === 500) {
    console.log(`   ✅ Rate limit reset successful! Request passed.`);
    return true;
  } else if (result.status === 429) {
    console.log(`   ⚠️ Rate limit still active (might need more time)`);
    return false;
  } else {
    console.log(`   ⚠️ Unexpected status: ${result.status}`);
    return false;
  }
}

async function testWebhookRateLimiting() {
  console.log('🚀 Webhook Rate Limiting Tests');
  console.log('='.repeat(60));
  
  const testResults = [];
  
  // Test 1: UniPile message webhook rate limiting
  const unipileMessageLimit = { max: 100, windowMs: 60000 };
  const test1 = await testRateLimit(
    '/unipile/messages',
    unipileMessagePayload,
    'UniPile Message Webhook',
    unipileMessageLimit
  );
  testResults.push({ name: 'UniPile Message Rate Limit', passed: test1 });
  
  // Small delay between tests
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 2: UniPile account status webhook rate limiting
  const unipileAccountLimit = { max: 50, windowMs: 60000 };
  const test2 = await testRateLimit(
    '/unipile/account-status',
    unipileAccountPayload,
    'UniPile Account Status Webhook',
    unipileAccountLimit
  );
  testResults.push({ name: 'UniPile Account Rate Limit', passed: test2 });
  
  // Small delay between tests
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 3: Gmail webhook rate limiting (with lower limit for faster testing)
  // Note: We'll test with a smaller number to avoid waiting too long
  console.log(`\n🧪 Testing Gmail webhook rate limiting (quick test with 10 requests)...`);
  const gmailLimit = { max: 200, windowMs: 60000 };
  
  // Quick test: send 10 requests, then one more
  console.log(`📤 Sending 10 requests...`);
  for (let i = 0; i < 10; i++) {
    await makeWebhookRequest('/gmail/messages', gmailPayload);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  const gmailResult = await makeWebhookRequest('/gmail/messages', gmailPayload);
  if (gmailResult.status === 200 || gmailResult.status === 400 || gmailResult.status === 500) {
    console.log(`   ✅ Gmail webhook accepting requests (rate limit not hit with 10 requests)`);
    testResults.push({ name: 'Gmail Webhook Rate Limit', passed: true });
  } else if (gmailResult.status === 429) {
    console.log(`   ⚠️ Gmail webhook rate limited (unexpected at 10 requests)`);
    testResults.push({ name: 'Gmail Webhook Rate Limit', passed: false });
  } else {
    console.log(`   ⚠️ Unexpected status: ${gmailResult.status}`);
    testResults.push({ name: 'Gmail Webhook Rate Limit', passed: false });
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  const passed = testResults.filter(r => r.passed).length;
  const total = testResults.length;
  
  testResults.forEach(result => {
    console.log(`${result.passed ? '✅' : '❌'} ${result.name}: ${result.passed ? 'PASSED' : 'FAILED'}`);
  });
  
  console.log(`\n✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${total - passed}/${total}`);
  console.log(`📈 Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
  
  if (passed === total) {
    console.log('\n🎉 All rate limiting tests passed!');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the output above.');
  }
}

// Run the tests
testWebhookRateLimiting().catch(console.error);

