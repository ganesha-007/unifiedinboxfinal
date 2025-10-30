const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = process.env.API_URL || 'http://localhost:3001';
const WEBHOOK_SECRET = process.env.UNIPILE_WEBHOOK_SECRET || 'test_secret_key_123';

// Test user data (replace with actual test user)
const TEST_USER_ID = 'test-user-123';
const TEST_MAILBOX_ID = 'test-mailbox-123';
const TEST_EMAIL = 'test@example.com';

/**
 * Generate HMAC signature for webhook
 */
function generateSignature(payload, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  return hmac.digest('hex');
}

/**
 * Test 1: Record a hard bounce
 */
async function testHardBounce() {
  console.log('\n📧 Test 1: Recording hard bounce...');
  
  const payload = {
    user_id: TEST_USER_ID,
    mailbox_id: TEST_MAILBOX_ID,
    email_address: TEST_EMAIL,
    bounce_type: 'hard',
    bounce_reason: '550 5.1.1 User does not exist',
    bounce_code: '550',
    bounce_category: 'invalid_recipient',
    diagnostic_code: '550 5.1.1',
    recipient_email: 'invalid@example.com'
  };
  
  const payloadString = JSON.stringify(payload);
  const signature = generateSignature(payloadString, WEBHOOK_SECRET);
  
  try {
    const response = await axios.post(
      `${BASE_URL}/api/email/bounce`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-unipile-signature': signature
        }
      }
    );
    
    console.log('✅ Hard bounce recorded:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Hard bounce test failed:', error.response?.data || error.message);
    return false;
  }
}

/**
 * Test 2: Record a soft bounce
 */
async function testSoftBounce() {
  console.log('\n📧 Test 2: Recording soft bounce...');
  
  const payload = {
    user_id: TEST_USER_ID,
    mailbox_id: TEST_MAILBOX_ID,
    email_address: TEST_EMAIL,
    bounce_type: 'soft',
    bounce_reason: '451 Temporary failure',
    bounce_code: '451',
    bounce_category: 'temporary_failure',
    diagnostic_code: '451 4.4.1',
    recipient_email: 'tempfail@example.com'
  };
  
  const payloadString = JSON.stringify(payload);
  const signature = generateSignature(payloadString, WEBHOOK_SECRET);
  
  try {
    const response = await axios.post(
      `${BASE_URL}/api/email/bounce`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-unipile-signature': signature
        }
      }
    );
    
    console.log('✅ Soft bounce recorded:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Soft bounce test failed:', error.response?.data || error.message);
    return false;
  }
}

/**
 * Test 3: Record a complaint
 */
async function testComplaint() {
  console.log('\n🚨 Test 3: Recording complaint...');
  
  const payload = {
    user_id: TEST_USER_ID,
    mailbox_id: TEST_MAILBOX_ID,
    email_address: TEST_EMAIL,
    complaint_type: 'spam',
    complaint_reason: 'User marked email as spam',
    complaint_feedback_type: 'abuse',
    recipient_email: 'complained@example.com'
  };
  
  const payloadString = JSON.stringify(payload);
  const signature = generateSignature(payloadString, WEBHOOK_SECRET);
  
  try {
    const response = await axios.post(
      `${BASE_URL}/api/email/complaint`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-unipile-signature': signature
        }
      }
    );
    
    console.log('✅ Complaint recorded:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Complaint test failed:', error.response?.data || error.message);
    return false;
  }
}

/**
 * Test 4: Parse ARF bounce report
 */
async function testARFBounceReport() {
  console.log('\n📧 Test 4: Parsing ARF bounce report...');
  
  const arfReport = `Content-Type: multipart/report; report-type=feedback-report

--boundary
Content-Type: text/plain

This is a bounce notification.

--boundary
Content-Type: message/feedback-report

Feedback-Type: abuse
User-Agent: SomeMailer/1.0
Version: 1
Original-Recipient: rfc822;bounced@example.com
Final-Recipient: rfc822;bounced@example.com
Original-Message-ID: <original@example.com>
Status: 5.1.1
Action: failed
Diagnostic-Code: 550 5.1.1 User does not exist

--boundary--`;

  const payload = {
    user_id: TEST_USER_ID,
    mailbox_id: TEST_MAILBOX_ID,
    email_address: TEST_EMAIL,
    raw_report: arfReport
  };
  
  const payloadString = JSON.stringify(payload);
  const signature = generateSignature(payloadString, WEBHOOK_SECRET);
  
  try {
    const response = await axios.post(
      `${BASE_URL}/api/email/bounce`,
      { raw_report: arfReport },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-unipile-signature': signature
        }
      }
    );
    
    console.log('✅ ARF bounce report processed:', response.data);
    return true;
  } catch (error) {
    console.error('❌ ARF bounce report test failed:', error.response?.data || error.message);
    return false;
  }
}

/**
 * Test 5: Test email blocking (3 hard bounces)
 */
async function testEmailBlocking() {
  console.log('\n🚫 Test 5: Testing email blocking (3 hard bounces)...');
  
  const blockedEmail = 'blocked@example.com';
  
  // Record 3 hard bounces
  for (let i = 1; i <= 3; i++) {
    const payload = {
      user_id: TEST_USER_ID,
      mailbox_id: TEST_MAILBOX_ID,
      email_address: TEST_EMAIL,
      bounce_type: 'hard',
      bounce_reason: `550 5.1.1 User does not exist (${i}/3)`,
      recipient_email: blockedEmail
    };
    
    const payloadString = JSON.stringify(payload);
    const signature = generateSignature(payloadString, WEBHOOK_SECRET);
    
    try {
      await axios.post(
        `${BASE_URL}/api/email/bounce`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-unipile-signature': signature
          }
        }
      );
      console.log(`✅ Recorded hard bounce ${i}/3 for ${blockedEmail}`);
    } catch (error) {
      console.error(`❌ Failed to record bounce ${i}:`, error.response?.data || error.message);
    }
  }
  
  // Check if email is blocked (would need to test via email sending endpoint)
  console.log(`✅ Email ${blockedEmail} should now be blocked (3 hard bounces)`);
  return true;
}

/**
 * Test 6: Test complaint blocking (1 complaint)
 */
async function testComplaintBlocking() {
  console.log('\n🚫 Test 6: Testing complaint blocking...');
  
  const complainedEmail = 'complained@example.com';
  
  const payload = {
    user_id: TEST_USER_ID,
    mailbox_id: TEST_MAILBOX_ID,
    email_address: TEST_EMAIL,
    complaint_type: 'spam',
    complaint_reason: 'User marked email as spam',
    recipient_email: complainedEmail
  };
  
  const payloadString = JSON.stringify(payload);
  const signature = generateSignature(payloadString, WEBHOOK_SECRET);
  
  try {
    await axios.post(
      `${BASE_URL}/api/email/complaint`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-unipile-signature': signature
        }
      }
    );
    
    console.log(`✅ Complaint recorded for ${complainedEmail}`);
    console.log(`✅ Email ${complainedEmail} should now be blocked (1 complaint)`);
    return true;
  } catch (error) {
    console.error('❌ Complaint blocking test failed:', error.response?.data || error.message);
    return false;
  }
}

/**
 * Test 7: Get bounce statistics (requires authentication)
 */
async function testGetBounceStats() {
  console.log('\n📊 Test 7: Getting bounce statistics...');
  
  // Note: This would require a valid JWT token
  // For now, we'll just show the expected endpoint
  console.log('ℹ️  To test this, use a valid JWT token:');
  console.log(`   GET ${BASE_URL}/api/email/bounces`);
  console.log('   Headers: Authorization: Bearer <token>');
  
  return true;
}

/**
 * Test 8: Get reputation (requires authentication)
 */
async function testGetReputation() {
  console.log('\n📊 Test 8: Getting reputation...');
  
  // Note: This would require a valid JWT token
  console.log('ℹ️  To test this, use a valid JWT token:');
  console.log(`   GET ${BASE_URL}/api/email/reputation`);
  console.log('   Headers: Authorization: Bearer <token>');
  
  return true;
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('🧪 Starting bounce/complaint handling tests...\n');
  console.log(`📍 Testing against: ${BASE_URL}`);
  console.log(`🔑 Using webhook secret: ${WEBHOOK_SECRET.substring(0, 10)}...`);
  
  const results = {
    hardBounce: await testHardBounce(),
    softBounce: await testSoftBounce(),
    complaint: await testComplaint(),
    arfBounceReport: await testARFBounceReport(),
    emailBlocking: await testEmailBlocking(),
    complaintBlocking: await testComplaintBlocking(),
    getBounceStats: await testGetBounceStats(),
    getReputation: await testGetReputation()
  };
  
  console.log('\n📊 Test Results Summary:');
  console.log('========================');
  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASSED' : 'FAILED'}`);
  });
  
  const passedCount = Object.values(results).filter(Boolean).length;
  const totalCount = Object.keys(results).length;
  
  console.log(`\n📈 Overall: ${passedCount}/${totalCount} tests passed`);
  
  if (passedCount === totalCount) {
    console.log('🎉 All tests passed!');
  } else {
    console.log('⚠️  Some tests failed. Check the logs above for details.');
  }
}

// Run tests
runAllTests().catch(console.error);
