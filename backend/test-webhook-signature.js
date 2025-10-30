const crypto = require('crypto');
const axios = require('axios');

// Test webhook signature verification
const WEBHOOK_SECRET = 'test_secret_key_123';
const WEBHOOK_URL = 'http://localhost:3001/api/webhooks/unipile/messages';

// Sample webhook payload
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
      body: 'This is a test message for webhook signature verification',
      timestamp: new Date().toISOString(),
      attachments: []
    }
  }
};

// Generate HMAC-SHA256 signature
function generateSignature(payload, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex');
}

async function testWebhookSignature() {
  try {
    console.log('🧪 Testing webhook signature verification...\n');
    
    // Generate signature
    const signature = generateSignature(testPayload, WEBHOOK_SECRET);
    console.log('📝 Generated signature:', signature);
    
    // Test 1: Valid signature
    console.log('\n🔍 Test 1: Valid signature');
    try {
      const response1 = await axios.post(WEBHOOK_URL, testPayload, {
        headers: {
          'Content-Type': 'application/json',
          'X-UniPile-Signature': signature
        }
      });
      console.log('✅ Valid signature test passed:', response1.status, response1.data);
    } catch (error) {
      if (error.response) {
        console.log('❌ Valid signature test failed:', error.response.status, error.response.data);
      } else {
        console.log('❌ Valid signature test failed:', error.message);
      }
    }
    
    // Test 2: Invalid signature
    console.log('\n🔍 Test 2: Invalid signature');
    try {
      const response2 = await axios.post(WEBHOOK_URL, testPayload, {
        headers: {
          'Content-Type': 'application/json',
          'X-UniPile-Signature': 'invalid_signature_123'
        }
      });
      console.log('❌ Invalid signature test should have failed:', response2.status, response2.data);
    } catch (error) {
      if (error.response) {
        console.log('✅ Invalid signature test passed (correctly rejected):', error.response.status, error.response.data);
      } else {
        console.log('❌ Invalid signature test failed:', error.message);
      }
    }
    
    // Test 3: Missing signature
    console.log('\n🔍 Test 3: Missing signature');
    try {
      const response3 = await axios.post(WEBHOOK_URL, testPayload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      console.log('❌ Missing signature test should have failed:', response3.status, response3.data);
    } catch (error) {
      if (error.response) {
        console.log('✅ Missing signature test passed (correctly rejected):', error.response.status, error.response.data);
      } else {
        console.log('❌ Missing signature test failed:', error.message);
      }
    }
    
    // Test 4: Different payload with same signature (should fail)
    console.log('\n🔍 Test 4: Different payload with same signature');
    const differentPayload = { ...testPayload, data: { ...testPayload.data, message: { ...testPayload.data.message, body: 'Different message' } } };
    try {
      const response4 = await axios.post(WEBHOOK_URL, differentPayload, {
        headers: {
          'Content-Type': 'application/json',
          'X-UniPile-Signature': signature // Using signature for different payload
        }
      });
      console.log('❌ Different payload test should have failed:', response4.status, response4.data);
    } catch (error) {
      if (error.response) {
        console.log('✅ Different payload test passed (correctly rejected):', error.response.status, error.response.data);
      } else {
        console.log('❌ Different payload test failed:', error.message);
      }
    }
    
    console.log('\n🎉 Webhook signature verification tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testWebhookSignature();
