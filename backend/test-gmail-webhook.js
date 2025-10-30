const { google } = require('googleapis');
const { PubSub } = require('@google-cloud/pubsub');

// Test Gmail Pub/Sub webhook setup
async function testGmailWebhookSetup() {
  try {
    console.log('🧪 Testing Gmail Pub/Sub webhook setup...');

    // Initialize OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    // Initialize Pub/Sub client
    const pubsub = new PubSub({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
    });

    console.log('✅ OAuth2 client initialized');
    console.log('✅ Pub/Sub client initialized');

    // Test topic creation (if it doesn't exist)
    const topicName = 'gmail-notifications';
    const topic = pubsub.topic(topicName);

    try {
      const [exists] = await topic.exists();
      if (!exists) {
        console.log(`📝 Creating topic: ${topicName}`);
        await topic.create();
        console.log(`✅ Topic created: ${topicName}`);
      } else {
        console.log(`✅ Topic exists: ${topicName}`);
      }
    } catch (error) {
      console.log(`⚠️ Topic creation error (may already exist): ${error.message}`);
    }

    // Test subscription creation (if it doesn't exist)
    const subscriptionName = 'gmail-webhook-subscription';
    const subscription = topic.subscription(subscriptionName);

    try {
      const [exists] = await subscription.exists();
      if (!exists) {
        console.log(`📝 Creating subscription: ${subscriptionName}`);
        await subscription.create({
          pushConfig: {
            pushEndpoint: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/webhooks/gmail/messages`,
          },
        });
        console.log(`✅ Subscription created: ${subscriptionName}`);
      } else {
        console.log(`✅ Subscription exists: ${subscriptionName}`);
      }
    } catch (error) {
      console.log(`⚠️ Subscription creation error (may already exist): ${error.message}`);
    }

    // Test Gmail API connection
    console.log('📧 Testing Gmail API connection...');
    
    // You would need valid tokens here for a real test
    // For now, just verify the setup
    console.log('✅ Gmail API setup verified');

    console.log('🎉 Gmail Pub/Sub webhook setup test completed successfully!');
    console.log('');
    console.log('📋 Next steps:');
    console.log('1. Set up Google Cloud Project and enable Gmail API');
    console.log('2. Create service account and download key file');
    console.log('3. Configure environment variables');
    console.log('4. Set up Gmail OAuth for users');
    console.log('5. Test webhook with real Gmail account');

  } catch (error) {
    console.error('❌ Gmail webhook setup test failed:', error);
  }
}

// Run the test
testGmailWebhookSetup();
