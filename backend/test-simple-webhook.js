const crypto = require('crypto');
const axios = require('axios');

// Simple test for webhook signature verification
const WEBHOOK_SECRET = 'test_secret_key_123';
const WEBHOOK_URL = 'http://localhost:3001/api/webhooks/unipile/messages';

// Generate HMAC-SHA256 signature
function generateSignature(payload, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex');
}

async function testSignatureVerification() {
  console.log('🔐 Testing Webhook Signature Verification\n');
  
  // Test payload
  const payload = { test: 'webhook signature verification' };
  const signature = generateSignature(payload, WEBHOOK_SECRET);
  
  console.log('📝 Payload:', JSON.stringify(payload));
  console.log('🔑 Generated signature:', signature);
  
  // Test with valid signature
  console.log('\n✅ Test 1: Valid signature');
  try {
    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-UniPile-Signature': signature
      }
    });
    console.log('Status:', response.status);
    console.log('Response:', response.data);
  } catch (error) {
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', error.response.data);
    } else {
      console.log('Error:', error.message);
    }
  }
  
  // Test with invalid signature
  console.log('\n❌ Test 2: Invalid signature');
  try {
    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-UniPile-Signature': 'invalid_signature'
      }
    });
    console.log('Status:', response.status);
    console.log('Response:', response.data);
  } catch (error) {
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', error.response.data);
    } else {
      console.log('Error:', error.message);
    }
  }
  
  console.log('\n🎉 Signature verification test completed!');
}

testSignatureVerification();
