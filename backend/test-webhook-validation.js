const crypto = require('crypto');
const axios = require('axios');

// Test webhook payload validation
const WEBHOOK_SECRET = 'test_secret_key_123';
const WEBHOOK_URL = 'http://localhost:3001/api/webhooks/unipile/messages';

// Generate HMAC-SHA256 signature
function generateSignature(payload, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex');
}

async function testWebhookPayloadValidation() {
  console.log('🧪 Testing Webhook Payload Validation\n');
  
  // Test 1: Valid UniPile message payload
  console.log('✅ Test 1: Valid UniPile message payload');
  const validPayload = {
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
  };
  
  const validSignature = generateSignature(validPayload, WEBHOOK_SECRET);
  
  try {
    const response = await axios.post(WEBHOOK_URL, validPayload, {
      headers: {
        'Content-Type': 'application/json',
        'X-UniPile-Signature': validSignature
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
  
  // Test 2: Invalid payload - missing required fields
  console.log('\n❌ Test 2: Invalid payload - missing required fields');
  const invalidPayload = {
    event: 'message.new',
    data: {
      account_id: 'test_account_123',
      // Missing chat_id and message
    }
  };
  
  const invalidSignature = generateSignature(invalidPayload, WEBHOOK_SECRET);
  
  try {
    const response = await axios.post(WEBHOOK_URL, invalidPayload, {
      headers: {
        'Content-Type': 'application/json',
        'X-UniPile-Signature': invalidSignature
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
  
  // Test 3: Invalid payload - wrong data types
  console.log('\n❌ Test 3: Invalid payload - wrong data types');
  const wrongTypePayload = {
    event: 'message.new',
    data: {
      account_id: 123, // Should be string
      chat_id: 'test_chat_456',
      message: {
        id: 'test_msg_789',
        from: {
          name: 'Test User',
          phone: '+1234567890'
        },
        body: 'This is a test message',
        timestamp: 'invalid-date', // Invalid date format
        attachments: 'not-an-array' // Should be array
      }
    }
  };
  
  const wrongTypeSignature = generateSignature(wrongTypePayload, WEBHOOK_SECRET);
  
  try {
    const response = await axios.post(WEBHOOK_URL, wrongTypePayload, {
      headers: {
        'Content-Type': 'application/json',
        'X-UniPile-Signature': wrongTypeSignature
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
  
  // Test 4: Valid direct UniPile format
  console.log('\n✅ Test 4: Valid direct UniPile format');
  const directPayload = {
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
  };
  
  const directSignature = generateSignature(directPayload, WEBHOOK_SECRET);
  
  try {
    const response = await axios.post(WEBHOOK_URL, directPayload, {
      headers: {
        'Content-Type': 'application/json',
        'X-UniPile-Signature': directSignature
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
  
  // Test 5: Payload with malicious content (should be sanitized)
  console.log('\n🧹 Test 5: Payload with malicious content (should be sanitized)');
  const maliciousPayload = {
    event: 'message.new',
    data: {
      account_id: 'test_account_123',
      chat_id: 'test_chat_456',
      message: {
        id: 'test_msg_789',
        from: {
          name: 'Test User<script>alert("xss")</script>',
          phone: '+1234567890'
        },
        body: 'This is a test message with <script>alert("xss")</script>',
        timestamp: new Date().toISOString(),
        attachments: [],
        // Extra malicious fields that should be stripped
        maliciousField: 'should be removed',
        anotherBadField: { nested: 'malicious' }
      }
    }
  };
  
  const maliciousSignature = generateSignature(maliciousPayload, WEBHOOK_SECRET);
  
  try {
    const response = await axios.post(WEBHOOK_URL, maliciousPayload, {
      headers: {
        'Content-Type': 'application/json',
        'X-UniPile-Signature': maliciousSignature
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
  
  // Test 6: Payload exceeding size limits
  console.log('\n❌ Test 6: Payload exceeding size limits');
  const oversizedPayload = {
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
        body: 'A'.repeat(15000), // Exceeds 10000 character limit
        timestamp: new Date().toISOString(),
        attachments: []
      }
    }
  };
  
  const oversizedSignature = generateSignature(oversizedPayload, WEBHOOK_SECRET);
  
  try {
    const response = await axios.post(WEBHOOK_URL, oversizedPayload, {
      headers: {
        'Content-Type': 'application/json',
        'X-UniPile-Signature': oversizedSignature
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
  
  console.log('\n🎉 Webhook payload validation tests completed!');
}

// Run the test
testWebhookPayloadValidation();

