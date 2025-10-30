import { Request, Response } from 'express';
import { google } from 'googleapis';
import { PubSub } from '@google-cloud/pubsub';
import { pool } from '../config/database';
import { convertHtmlToText, cleanEmailBody } from '../utils/emailUtils';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Initialize Pub/Sub client
const pubsub = new PubSub({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE, // Optional: path to service account key file
});

/**
 * Handle Gmail Pub/Sub webhook notifications
 */
export async function handleGmailWebhook(req: Request, res: Response) {
  try {
    console.log('📧 Gmail webhook received:', JSON.stringify(req.body, null, 2));

    // Verify this is a Pub/Sub message
    if (!req.body.message) {
      console.log('⚠️ Not a Pub/Sub message, ignoring');
      return res.status(200).json({ received: true });
    }

    const message = req.body.message;
    const data = Buffer.from(message.data, 'base64').toString();
    const notification = JSON.parse(data);

    console.log('📧 Gmail notification:', notification);

    // Process the Gmail notification
    await processGmailNotification(notification);

    // Acknowledge the message
    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('❌ Gmail webhook error:', error);
    res.status(500).json({ error: 'Failed to process Gmail webhook' });
  }
}

/**
 * Process Gmail notification and fetch new messages
 */
async function processGmailNotification(notification: any) {
  try {
    const { emailAddress, historyId } = notification;

    console.log(`📧 Processing Gmail notification for ${emailAddress}, historyId: ${historyId}`);

    // Find the user associated with this email address
    const userResult = await pool.query(
      'SELECT user_id FROM user_credentials WHERE gmail_email = $1',
      [emailAddress]
    );

    if (userResult.rows.length === 0) {
      console.log(`⚠️ No user found for email ${emailAddress}`);
      return;
    }

    const userId = userResult.rows[0].user_id;
    console.log(`👤 Found user ${userId} for email ${emailAddress}`);

    // Get user's Gmail credentials
    const credentialsResult = await pool.query(
      'SELECT gmail_access_token, gmail_refresh_token, gmail_token_expiry FROM user_credentials WHERE user_id = $1',
      [userId]
    );

    if (credentialsResult.rows.length === 0) {
      console.log(`⚠️ No Gmail credentials found for user ${userId}`);
      return;
    }

    const credentials = credentialsResult.rows[0];

    // Refresh token if needed
    const refreshedCredentials = await refreshGmailTokenIfNeeded(credentials);
    
    // Set up OAuth client
    oauth2Client.setCredentials({
      access_token: refreshedCredentials.access_token,
      refresh_token: refreshedCredentials.refresh_token,
      expiry_date: refreshedCredentials.expiry_date
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Get recent messages (last 10)
    const messagesResponse = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 10,
      q: 'in:inbox'
    });

    const messages = messagesResponse.data.messages || [];
    console.log(`📧 Found ${messages.length} recent messages`);

    // Process each message
    for (const messageRef of messages) {
      await processGmailMessage(gmail, messageRef.id!, userId, emailAddress);
    }

    console.log('✅ Gmail notification processing completed');
  } catch (error: any) {
    console.error('❌ Error processing Gmail notification:', error);
  }
}

/**
 * Process individual Gmail message
 */
async function processGmailMessage(gmail: any, messageId: string, userId: string, emailAddress: string) {
  try {
    // Get message details
    const messageResponse = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });

    const message = messageResponse.data;
    const headers = message.payload?.headers || [];
    
    // Extract message details
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject';
    const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
    const to = headers.find((h: any) => h.name === 'To')?.value || '';
    const date = headers.find((h: any) => h.name === 'Date')?.value || new Date().toISOString();
    
    // Extract message body
    let body = '';
    if (message.payload?.body?.data) {
      body = Buffer.from(message.payload.body.data, 'base64').toString();
    } else if (message.payload?.parts) {
      // Handle multipart messages
      for (const part of message.payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          body = Buffer.from(part.body.data, 'base64').toString();
          break;
        } else if (part.mimeType === 'text/html' && part.body?.data) {
          const htmlBody = Buffer.from(part.body.data, 'base64').toString();
          body = convertHtmlToText(htmlBody);
          break;
        }
      }
    }

    const cleanedBody = cleanEmailBody(body);

    // Check if message already exists
    const existingMessage = await pool.query(
      'SELECT id FROM channels_message WHERE provider_msg_id = $1',
      [messageId]
    );

    if (existingMessage.rows.length > 0) {
      console.log(`📧 Message ${messageId} already exists, skipping`);
      return;
    }

    // Get or create account (using UPSERT to handle duplicates)
    const accountResult = await pool.query(
      `INSERT INTO channels_account (user_id, provider, external_account_id, status, metadata) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (provider, external_account_id) 
       DO UPDATE SET 
         user_id = EXCLUDED.user_id,
         status = EXCLUDED.status,
         metadata = EXCLUDED.metadata,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [userId, 'email', emailAddress, 'connected', JSON.stringify({ email: emailAddress, type: 'GMAIL' })]
    );

    const accountId = accountResult.rows[0].id;

    // Create conversation ID from subject and participants
    const conversationId = `gmail_${Buffer.from(`${subject}_${from}_${to}`).toString('base64').replace(/[^a-zA-Z0-9]/g, '')}`;

    // Get or create chat (using UPSERT to handle duplicates)
    const chatResult = await pool.query(
      `INSERT INTO channels_chat (account_id, provider_chat_id, title, last_message_at, metadata) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (account_id, provider_chat_id) 
       DO UPDATE SET 
         title = EXCLUDED.title,
         last_message_at = EXCLUDED.last_message_at,
         metadata = EXCLUDED.metadata,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [accountId, conversationId, subject, new Date(date), JSON.stringify({ subject, from, to })]
    );

    const chatId = chatResult.rows[0].id;

    // Determine message direction
    const direction = from.includes(emailAddress) ? 'out' : 'in';

    // Store message
    await pool.query(
      'INSERT INTO channels_message (chat_id, provider_msg_id, direction, body, sent_at, metadata) VALUES ($1, $2, $3, $4, $5, $6)',
      [
        chatId,
        messageId,
        direction,
        cleanedBody,
        new Date(date),
        JSON.stringify({ subject, from, to, threadId: message.threadId })
      ]
    );

    console.log(`✅ Stored Gmail message: ${messageId} (${direction})`);

    // Update usage
    await updateUsage(userId, 'email', 'received');

    // Emit real-time notification
    const io = (global as any).io;
    if (io) {
      const messageData = {
        id: messageId,
        body: cleanedBody,
        direction,
        sent_at: new Date(date).toISOString(),
        from: { name: from, email: from },
        chat_id: chatId,
        provider_chat_id: conversationId
      };

      io.to(`user:${userId}`).emit('new_message', {
        chatId: conversationId,
        message: messageData
      });

      console.log(`📡 Emitted new_message event to user:${userId} and chat:${conversationId}`);
    }

  } catch (error: any) {
    console.error(`❌ Error processing Gmail message ${messageId}:`, error);
  }
}

/**
 * Refresh Gmail token if needed
 */
async function refreshGmailTokenIfNeeded(credentials: any) {
  const now = Date.now();
  const expiryBuffer = 300000; // 5 minutes

  if (!credentials.gmail_token_expiry || now >= (parseInt(credentials.gmail_token_expiry) - expiryBuffer)) {
    console.log('🔄 Refreshing Gmail access token...');
    
    oauth2Client.setCredentials({
      refresh_token: credentials.gmail_refresh_token
    });

    const { credentials: newCredentials } = await oauth2Client.refreshAccessToken();
    
    // Update token in database
    await pool.query(
      'UPDATE user_credentials SET gmail_access_token = $2, gmail_token_expiry = $3, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1',
      [credentials.user_id, newCredentials.access_token, Date.now() + (newCredentials.expiry_date! - Date.now())]
    );

    console.log('✅ Gmail token refreshed successfully');
    return {
      access_token: newCredentials.access_token,
      refresh_token: credentials.gmail_refresh_token,
      expiry_date: newCredentials.expiry_date
    };
  }

  return {
    access_token: credentials.gmail_access_token,
    refresh_token: credentials.gmail_refresh_token,
    expiry_date: credentials.gmail_token_expiry
  };
}

/**
 * Set up Gmail watch subscription for a user
 */
export async function setupGmailWatch(req: Request, res: Response) {
  try {
    const userId = req.body.userId;
    const emailAddress = req.body.emailAddress;

    if (!userId || !emailAddress) {
      return res.status(400).json({ error: 'userId and emailAddress are required' });
    }

    // Get user's Gmail credentials
    const credentialsResult = await pool.query(
      'SELECT gmail_access_token, gmail_refresh_token, gmail_token_expiry FROM user_credentials WHERE user_id = $1',
      [userId]
    );

    if (credentialsResult.rows.length === 0) {
      return res.status(400).json({ error: 'Gmail credentials not found' });
    }

    const credentials = credentialsResult.rows[0];

    // Set up OAuth client
    oauth2Client.setCredentials({
      access_token: credentials.gmail_access_token,
      refresh_token: credentials.gmail_refresh_token,
      expiry_date: credentials.gmail_token_expiry
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Set up watch subscription
    const watchResponse = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/topics/gmail-notifications`,
        labelIds: ['INBOX'],
        labelFilterAction: 'include'
      }
    });

    console.log(`✅ Gmail watch setup for user ${userId}:`, watchResponse.data);

    res.json({
      success: true,
      watchResponse: watchResponse.data,
      message: 'Gmail watch subscription created successfully'
    });

  } catch (error: any) {
    console.error('❌ Gmail watch setup error:', error);
    res.status(500).json({ error: 'Failed to setup Gmail watch' });
  }
}

/**
 * Helper function to update usage statistics
 */
async function updateUsage(userId: string, provider: string, type: 'sent' | 'received') {
  const now = new Date();
  const period_ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const column = type === 'sent' ? 'messages_sent' : 'messages_rcvd';
  
  await pool.query(
    `INSERT INTO channels_usage (user_id, provider, period_ym, ${column})
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (user_id, provider, period_ym)
     DO UPDATE SET ${column} = channels_usage.${column} + 1, updated_at = CURRENT_TIMESTAMP`,
    [userId, provider, period_ym]
  );
}
