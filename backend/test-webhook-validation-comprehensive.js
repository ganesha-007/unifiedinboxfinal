const crypto = require('crypto');
const axios = require('axios');

// Test webhook payload validation comprehensively
const WEBHOOK_SECRET = 'test_secret_key_123';
const WEBHOOK_URL = 'http://localhost:3001/api/webhooks/unipile/messages';

// Generate HMAC-SHA256 signature
function generateSignature(payload, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex');
}

async function runTest(testName, payload, shouldPass = true) {
  console.log(`\n${shouldPass ? '✅' : '❌'} ${testName}`);
  const signature = generateSignature(payload, WEBHOOK_SECRET);
  
  try {
    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-UniPile-Signature': signature
      },
      validateStatus: () => true // Don't throw on any status
    });
    
    if (shouldPass && response.status === 200) {
      console.log(`   ✅ PASSED - Status: ${response.status}`);
      return true;
    } else if (!shouldPass && response.status === 400) {
      console.log(`   ✅ PASSED - Status: ${response.status} (Expected rejection)`);
      console.log(`   Error: ${response.data.message || response.data.error}`);
      return true;
    } else {
      console.log(`   ❌ FAILED - Expected ${shouldPass ? '200' : '400'}, got ${response.status}`);
      console.log(`   Response:`, JSON.stringify(response.data, null, 2));
      return false;
    }
  } catch (error) {
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Error:`, error.response.data);
    } else {
      console.log(`   Error:`, error.message);
    }
    return false;
  }
}

async function testWebhookPayloadValidation() {
  console.log('🧪 Comprehensive Webhook Payload Validation Tests\n');
  console.log('='.repeat(60));
  
  const results = [];
  
  // Test 1: Valid UniPile message payload (nested format)
  results.push(await runTest(
    'Test 1: Valid UniPile message payload (nested format)',
    {
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
          body: 'This is a valid test message',
          timestamp: new Date().toISOString(),
          attachments: []
        }
      }
    },
    true
  ));
  
  // Test 2: Valid direct UniPile format
  results.push(await runTest(
    'Test 2: Valid direct UniPile format',
    {
      account_id: 'test_account_123',
      chat_id: 'test_chat_456',
      message_id: 'test_msg_789',
      text: 'This is a direct format message',
      sender: {
        attendee_name: 'Test User',
        attendee_provider_id: '+1234567890'
      },
      timestamp: new Date().toISOString(),
      attachments: []
    },
    true
  ));
  
  // Test 3: Invalid - missing required fields
  results.push(await runTest(
    'Test 3: Invalid - missing required fields',
    {
      event: 'message.new',
      data: {
        account_id: 'test_account_123'
        // Missing chat_id and message
      }
    },
    false
  ));
  
  // Test 4: Invalid - wrong data type for account_id
  results.push(await runTest(
    'Test 4: Invalid - wrong data type for account_id',
    {
      event: 'message.new',
      data: {
        account_id: 123, // Should be string
        chat_id: 'test_chat_456',
        message: {
          id: 'test_msg_789',
          from: { name: 'Test', phone: '+1234567890' },
          body: 'Test message',
          timestamp: new Date().toISOString(),
          attachments: []
        }
      }
    },
    false
  ));
  
  // Test 5: Invalid - missing message body
  results.push(await runTest(
    'Test 5: Invalid - missing message body',
    {
      event: 'message.new',
      data: {
        account_id: 'test_account_123',
        chat_id: 'test_chat_456',
        message: {
          id: 'test_msg_789',
          from: { name: 'Test', phone: '+1234567890' },
          // Missing body
          timestamp: new Date().toISOString(),
          attachments: []
        }
      }
    },
    false
  ));
  
  // Test 6: Invalid - invalid timestamp format
  results.push(await runTest(
    'Test 6: Invalid - invalid timestamp format',
    {
      event: 'message.new',
      data: {
        account_id: 'test_account_123',
        chat_id: 'test_chat_456',
        message: {
          id: 'test_msg_789',
          from: { name: 'Test', phone: '+1234567890' },
          body: 'Test message',
          timestamp: 'invalid-date', // Invalid format
          attachments: []
        }
      }
    },
    false
  ));
  
  // Test 7: Invalid - message body exceeds size limit
  results.push(await runTest(
    'Test 7: Invalid - message body exceeds size limit (10000 chars)',
    {
      event: 'message.new',
      data: {
        account_id: 'test_account_123',
        chat_id: 'test_chat_456',
        message: {
          id: 'test_msg_789',
          from: { name: 'Test', phone: '+1234567890' },
          body: 'A'.repeat(15000), // Exceeds 10000 character limit
          timestamp: new Date().toISOString(),
          attachments: []
        }
      }
    },
    false
  ));
  
  // Test 8: Valid - payload with extra fields (should be sanitized)
  results.push(await runTest(
    'Test 8: Valid - payload with extra fields (should be sanitized)',
    {
      event: 'message.new',
      data: {
        account_id: 'test_account_123',
        chat_id: 'test_chat_456',
        message: {
          id: 'test_msg_789',
          from: { name: 'Test User', phone: '+1234567890' },
          body: 'Test message',
          timestamp: new Date().toISOString(),
          attachments: [],
          extraField: 'should be removed',
          maliciousField: { nested: 'malicious' }
        },
        extraDataField: 'should be removed'
      }
    },
    true
  ));
  
  // Test 9: Invalid - invalid event type
  results.push(await runTest(
    'Test 9: Invalid - invalid event type',
    {
      event: 'invalid.event.type',
      data: {
        account_id: 'test_account_123',
        chat_id: 'test_chat_456',
        message: {
          id: 'test_msg_789',
          from: { name: 'Test', phone: '+1234567890' },
          body: 'Test message',
          timestamp: new Date().toISOString(),
          attachments: []
        }
      }
    },
    false
  ));
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  const passed = results.filter(r => r).length;
  const total = results.length;
  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${total - passed}/${total}`);
  console.log(`📈 Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
  
  if (passed === total) {
    console.log('\n🎉 All tests passed! Webhook payload validation is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the output above.');
  }
}

// Run the test
testWebhookPayloadValidation().catch(console.error);

