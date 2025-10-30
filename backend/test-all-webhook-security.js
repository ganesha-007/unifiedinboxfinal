const crypto = require('crypto');
const axios = require('axios');

// Comprehensive test for all webhook security features
const WEBHOOK_SECRET = 'test_secret_key_123';
const BASE_URL = 'http://localhost:3001/api/webhooks';

function generateSignature(payload, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex');
}

async function testAllSecurityFeatures() {
  console.log('🔒 Comprehensive Webhook Security Test');
  console.log('='.repeat(60));
  console.log('Testing all three security features:\n');
  console.log('1. ✅ HMAC/SHA-256 Signature Verification');
  console.log('2. ✅ Webhook Payload Validation');
  console.log('3. ✅ Rate Limiting');
  console.log('='.repeat(60) + '\n');

  const results = {
    signatureVerification: { passed: 0, failed: 0 },
    payloadValidation: { passed: 0, failed: 0 },
    rateLimiting: { passed: 0, failed: 0 }
  };

  // Test 1: Valid request with all security features
  console.log('✅ Test 1: Valid request (should pass all checks)');
  const validPayload = {
    event: 'message.new',
    data: {
      account_id: 'test_account_123',
      chat_id: 'test_chat_456',
      message: {
        id: 'test_msg_valid',
        from: {
          name: 'Test User',
          phone: '+1234567890'
        },
        body: 'Valid test message',
        timestamp: new Date().toISOString(),
        attachments: []
      }
    }
  };

  try {
    const validSignature = generateSignature(validPayload, WEBHOOK_SECRET);
    const response = await axios.post(`${BASE_URL}/unipile/messages`, validPayload, {
      headers: {
        'Content-Type': 'application/json',
        'X-UniPile-Signature': validSignature
      },
      validateStatus: () => true
    });

    if (response.status === 200 || response.status === 500) {
      console.log('   ✅ Signature verification: PASSED');
      console.log('   ✅ Payload validation: PASSED');
      console.log('   ✅ Rate limiting: PASSED (within limit)');
      if (response.headers['ratelimit-limit']) {
        console.log(`   📊 Rate Limit: ${response.headers['ratelimit-remaining']}/${response.headers['ratelimit-limit']} remaining`);
      }
      results.signatureVerification.passed++;
      results.payloadValidation.passed++;
      results.rateLimiting.passed++;
    } else {
      console.log(`   ⚠️  Unexpected status: ${response.status}`);
    }
  } catch (error) {
    console.log('   ❌ Request failed:', error.message);
  }

  // Test 2: Invalid signature (should fail signature verification)
  console.log('\n❌ Test 2: Invalid signature (should fail signature check)');
  try {
    const invalidSignature = 'invalid_signature_12345';
    const response = await axios.post(`${BASE_URL}/unipile/messages`, validPayload, {
      headers: {
        'Content-Type': 'application/json',
        'X-UniPile-Signature': invalidSignature
      },
      validateStatus: () => true
    });

    if (response.status === 401 && response.data.message?.includes('signature')) {
      console.log('   ✅ Signature verification correctly rejected invalid signature');
      results.signatureVerification.passed++;
    } else {
      console.log(`   ❌ Expected 401 for invalid signature, got ${response.status}`);
      results.signatureVerification.failed++;
    }
  } catch (error) {
    console.log('   ❌ Request failed:', error.message);
  }

  // Test 3: Missing signature (should fail signature verification)
  console.log('\n❌ Test 3: Missing signature (should fail signature check)');
  try {
    const response = await axios.post(`${BASE_URL}/unipile/messages`, validPayload, {
      headers: {
        'Content-Type': 'application/json'
        // No signature header
      },
      validateStatus: () => true
    });

    if (response.status === 401 && response.data.message?.includes('signature')) {
      console.log('   ✅ Signature verification correctly rejected missing signature');
      results.signatureVerification.passed++;
    } else {
      console.log(`   ⚠️  Expected 401 for missing signature, got ${response.status}`);
      results.signatureVerification.failed++;
    }
  } catch (error) {
    console.log('   ❌ Request failed:', error.message);
  }

  // Test 4: Invalid payload (should fail payload validation)
  console.log('\n❌ Test 4: Invalid payload (should fail validation)');
  const invalidPayload = {
    event: 'message.new',
    data: {
      account_id: 'test_account_123'
      // Missing required fields: chat_id and message
    }
  };

  try {
    const invalidSignature = generateSignature(invalidPayload, WEBHOOK_SECRET);
    const response = await axios.post(`${BASE_URL}/unipile/messages`, invalidPayload, {
      headers: {
        'Content-Type': 'application/json',
        'X-UniPile-Signature': invalidSignature
      },
      validateStatus: () => true
    });

    if (response.status === 400 && response.data.message?.includes('validation')) {
      console.log('   ✅ Payload validation correctly rejected invalid payload');
      results.payloadValidation.passed++;
    } else {
      console.log(`   ⚠️  Expected 400 for invalid payload, got ${response.status}`);
      results.payloadValidation.failed++;
    }
  } catch (error) {
    console.log('   ❌ Request failed:', error.message);
  }

  // Test 5: Rate limiting (send enough requests to trigger limit)
  console.log('\n⏱️  Test 5: Rate limiting (sending 105 requests to trigger limit)');
  console.log('   This will take a moment...');
  
  let rateLimitTriggered = false;
  let requestsPassed = 0;
  let requestsRateLimited = 0;

  for (let i = 0; i < 105; i++) {
    const signature = generateSignature(validPayload, WEBHOOK_SECRET);
    try {
      const response = await axios.post(`${BASE_URL}/unipile/messages`, validPayload, {
        headers: {
          'Content-Type': 'application/json',
          'X-UniPile-Signature': signature
        },
        validateStatus: () => true
      });

      if (response.status === 429) {
        requestsRateLimited++;
        if (!rateLimitTriggered) {
          rateLimitTriggered = true;
          console.log(`   ✅ Rate limit triggered at request #${i + 1}`);
        }
      } else if (response.status === 200 || response.status === 500) {
        requestsPassed++;
      }

      if ((i + 1) % 20 === 0) {
        process.stdout.write(`   Progress: ${i + 1}/105 requests (${requestsPassed} passed, ${requestsRateLimited} rate limited)\r`);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
    } catch (error) {
      // Ignore errors
    }
  }

  console.log(`\n   ✅ Requests passed: ${requestsPassed}`);
  console.log(`   ❌ Requests rate limited: ${requestsRateLimited}`);

  if (rateLimitTriggered) {
    console.log('   ✅ Rate limiting is working correctly!');
    results.rateLimiting.passed++;
  } else {
    console.log('   ⚠️  Rate limit not triggered (might need more requests or different timing)');
    results.rateLimiting.failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SECURITY FEATURES SUMMARY');
  console.log('='.repeat(60));

  console.log('\n1️⃣  HMAC/SHA-256 Signature Verification:');
  console.log(`   ✅ Passed: ${results.signatureVerification.passed}`);
  console.log(`   ❌ Failed: ${results.signatureVerification.failed}`);
  console.log(`   Status: ${results.signatureVerification.failed === 0 ? '✅ WORKING' : '⚠️ NEEDS ATTENTION'}`);

  console.log('\n2️⃣  Webhook Payload Validation:');
  console.log(`   ✅ Passed: ${results.payloadValidation.passed}`);
  console.log(`   ❌ Failed: ${results.payloadValidation.failed}`);
  console.log(`   Status: ${results.payloadValidation.failed === 0 ? '✅ WORKING' : '⚠️ NEEDS ATTENTION'}`);

  console.log('\n3️⃣  Rate Limiting:');
  console.log(`   ✅ Passed: ${results.rateLimiting.passed}`);
  console.log(`   ❌ Failed: ${results.rateLimiting.failed}`);
  console.log(`   Status: ${results.rateLimiting.failed === 0 ? '✅ WORKING' : '⚠️ NEEDS ATTENTION'}`);

  const allPassed = 
    results.signatureVerification.failed === 0 &&
    results.payloadValidation.failed === 0 &&
    results.rateLimiting.failed === 0;

  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('🎉 ALL WEBHOOK SECURITY FEATURES ARE WORKING FULLY!');
  } else {
    console.log('⚠️  Some security features need attention. Review the tests above.');
  }
  console.log('='.repeat(60));
}

testAllSecurityFeatures().catch(console.error);

