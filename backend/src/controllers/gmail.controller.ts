import { Request, Response } from 'express';
import { google } from 'googleapis';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { EmailLimitsService } from '../services/emailLimits.service';
import { trackEvent } from '../services/analytics.service';
import { enforceUsageLimits, trackUsage } from '../middleware/usageEnforcement';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

/**
 * Initiate Gmail OAuth flow
 */
export async function initiateGmailAuth(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify'
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: userId, // Pass user ID in state for callback
      prompt: 'consent' // Force consent screen to get refresh token
    });

    console.log(`🔐 Generated Gmail OAuth URL for user ${userId}`);
    res.json({ authUrl });
  } catch (error: any) {
    console.error('Gmail OAuth initiation error:', error);
    res.status(500).json({ error: 'Failed to initiate Gmail OAuth' });
  }
}

/**
 * Handle Gmail OAuth callback
 */
export async function handleGmailCallback(req: Request, res: Response) {
  try {
    const { code, state } = req.query;
    const userId = state as string;

    if (!code || !userId) {
      return res.status(400).json({ error: 'Missing authorization code or user ID' });
    }

    console.log(`🔄 Processing Gmail OAuth callback for user ${userId}`);

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code as string);
    oauth2Client.setCredentials(tokens);

    console.log('✅ Gmail OAuth tokens received:', {
      access_token: tokens.access_token ? 'present' : 'missing',
      refresh_token: tokens.refresh_token ? 'present' : 'missing',
      expiry_date: tokens.expiry_date
    });

    // Get user info from Gmail API
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    
    const emailAddress = profile.data.emailAddress;
    console.log(`📧 Gmail account connected: ${emailAddress}`);

    // Store tokens in database (only update Gmail fields for existing user)
    await pool.query(
      `UPDATE user_credentials 
       SET gmail_access_token = $2,
           gmail_refresh_token = $3,
           gmail_token_expiry = $4,
           gmail_email = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [userId, tokens.access_token, tokens.refresh_token, tokens.expiry_date, emailAddress]
    );

    // Create Gmail account entry
    await pool.query(
      `INSERT INTO channels_account (user_id, provider, external_account_id, status, metadata)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, provider, external_account_id) 
       DO UPDATE SET status = EXCLUDED.status, metadata = EXCLUDED.metadata`,
      [
        userId, 
        'email', 
        emailAddress, 
        'connected',
        JSON.stringify({ email: emailAddress, type: 'GMAIL' })
      ]
    );

    console.log(`✅ Gmail account ${emailAddress} connected for user ${userId}`);

    // Redirect to frontend with success
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/connections?gmail=connected`);
  } catch (error: any) {
    console.error('Gmail OAuth callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/connections?gmail=error`);
  }
}

/**
 * Get Gmail accounts for user
 */
export async function getGmailAccounts(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await pool.query(
      `SELECT ca.*, uc.gmail_email, uc.gmail_token_expiry
       FROM channels_account ca
       LEFT JOIN user_credentials uc ON ca.user_id = uc.user_id
       WHERE ca.user_id = $1 AND ca.provider = 'email'`,
      [userId]
    );

    const accounts = result.rows.map(account => ({
      id: account.id,
      external_account_id: account.external_account_id,
      provider: account.provider,
      status: account.status,
      email: account.gmail_email,
      connected_at: account.created_at,
      metadata: account.metadata
    }));

    console.log(`📧 Found ${accounts.length} Gmail accounts for user ${userId}`);
    res.json(accounts);
  } catch (error: any) {
    console.error('Get Gmail accounts error:', error);
    res.status(500).json({ error: 'Failed to get Gmail accounts' });
  }
}

/**
 * Get Gmail chats (email threads)
 */
export async function getGmailChats(req: AuthRequest, res: Response) {
  try {
    const { accountId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
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
    
    // Set up OAuth client with stored tokens
    oauth2Client.setCredentials({
      access_token: credentials.gmail_access_token,
      refresh_token: credentials.gmail_refresh_token,
      expiry_date: credentials.gmail_token_expiry
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Get email threads
    const threadsResponse = await gmail.users.threads.list({
      userId: 'me',
      maxResults: 50
    });

    const threads = threadsResponse.data.threads || [];
    console.log(`📧 Found ${threads.length} Gmail threads`);

    // Get detailed thread information
    const chatPromises = threads.map(async (thread: any) => {
      const threadDetails = await gmail.users.threads.get({
        userId: 'me',
        id: thread.id
      });

      const messages = threadDetails.data.messages || [];
      const latestMessage = messages[messages.length - 1];
      
      if (!latestMessage) return null;

      const headers = latestMessage.payload?.headers || [];
      const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject';
      const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
      const date = headers.find((h: any) => h.name === 'Date')?.value || new Date().toISOString();
      const snippet = latestMessage.snippet || '';

      return {
        id: thread.id,
        account_id: accountId,
        provider_chat_id: thread.id,
        title: subject,
        last_message_at: new Date(date).toISOString(),
        metadata: {
          subject,
          from,
          thread_id: thread.id,
          message_count: messages.length,
          snippet
        }
      };
    });

    const chats = (await Promise.all(chatPromises)).filter(chat => chat !== null);
    
    // Store chats in database (align with channels_chat schema)
    for (const chat of chats) {
      await pool.query(
        `INSERT INTO channels_chat (account_id, provider_chat_id, title, last_message_at, metadata)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (account_id, provider_chat_id) 
         DO UPDATE SET 
           title = EXCLUDED.title,
           last_message_at = EXCLUDED.last_message_at,
           metadata = EXCLUDED.metadata`,
        [
          accountId,
          chat.provider_chat_id,
          chat.title,
          chat.last_message_at,
          JSON.stringify(chat.metadata)
        ]
      );
    }

    console.log(`📧 Stored ${chats.length} Gmail chats in database`);
    res.json(chats);
  } catch (error: any) {
    console.error('Get Gmail chats error:', error);
    res.status(500).json({ error: 'Failed to get Gmail chats' });
  }
}

/**
 * Get messages from Gmail thread
 */
export async function getGmailMessages(req: AuthRequest, res: Response) {
  try {
    const { accountId, chatId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
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
    
    // Set up OAuth client with stored tokens
    oauth2Client.setCredentials({
      access_token: credentials.gmail_access_token,
      refresh_token: credentials.gmail_refresh_token,
      expiry_date: credentials.gmail_token_expiry
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Resolve numeric chat row id from provider_chat_id
    const chatRow = await pool.query(
      `SELECT id FROM channels_chat WHERE account_id = $1 AND provider_chat_id = $2`,
      [accountId, chatId]
    );
    const numericChatId: number | null = chatRow.rows[0]?.id ?? null;

    // Get thread details from Gmail using provider chat id
    const threadResponse = await gmail.users.threads.get({
      userId: 'me',
      id: chatId
    });

    const messages = threadResponse.data.messages || [];
    console.log(`📧 Found ${messages.length} messages in thread ${chatId}`);

    // Process each message
    // Helper to recursively extract text/plain or text/html parts
    const extractBody = (payload: any): { body: string; isHtml: boolean } => {
      if (!payload) return { body: '', isHtml: false };
      
      // Try direct body first
      const data = payload.body?.data;
      if (data) {
        const decoded = Buffer.from(data, 'base64').toString();
        return { body: decoded, isHtml: payload.mimeType === 'text/html' };
      }
      
      // Traverse parts
      if (payload.parts && payload.parts.length) {
        // Prefer text/plain
        const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
        if (textPart?.body?.data) {
          const decoded = Buffer.from(textPart.body.data, 'base64').toString();
          return { body: decoded, isHtml: false };
        }
        // Fallback to text/html
        const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
        if (htmlPart?.body?.data) {
          const decoded = Buffer.from(htmlPart.body.data, 'base64').toString();
          return { body: decoded, isHtml: true };
        }
        // Recurse into nested parts
        for (const part of payload.parts) {
          const res = extractBody(part);
          if (res.body) return res;
        }
      }
      return { body: '', isHtml: false };
    };

    // Helper to clean email body content
    const cleanEmailBody = (body: string): string => {
      if (!body) return '';
      
      // Remove MIME headers and boundaries more aggressively
      let cleaned = body
        .replace(/MIME-Version:.*?\r?\n/g, '')
        .replace(/Content-Type:.*?\r?\n/g, '')
        .replace(/Content-Transfer-Encoding:.*?\r?\n/g, '')
        .replace(/Content-Disposition:.*?\r?\n/g, '')
        .replace(/--boundary[^-\r\n]*/g, '')
        .replace(/--boundary[^-\r\n]*--/g, '')
        .replace(/^\s*--[^-\r\n]*.*$/gm, '') // Remove boundary lines
        .replace(/^\s*Content-Type:.*$/gm, '') // Remove content-type lines
        .replace(/^\s*MIME-Version:.*$/gm, '') // Remove MIME version lines
        .replace(/^\s*Content-Transfer-Encoding:.*$/gm, '') // Remove encoding lines
        .replace(/^\s*Content-Disposition:.*$/gm, '') // Remove disposition lines
        .replace(/^[A-Za-z0-9+/=]{50,}$/gm, '') // Remove long base64 strings
        .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove multiple empty lines
        .trim();
      
      // If the cleaned content is empty or just whitespace, return original
      if (!cleaned || cleaned.length < 3) {
        return body.trim();
      }
      
      return cleaned;
    };

    const messagePromises = messages.map(async (message: any) => {
      const messageDetails = await gmail.users.messages.get({
        userId: 'me',
        id: message.id
      });

      const headers = messageDetails.data.payload?.headers || [];
      const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
      const from = headers.find((h: any) => h.name === 'From')?.value || '';
      const to = headers.find((h: any) => h.name === 'To')?.value || '';
      const date = headers.find((h: any) => h.name === 'Date')?.value || new Date().toISOString();
      
      // Extract message body (handles multipart/alternative and nested parts)
      const bodyExtract = extractBody(messageDetails.data.payload);
      const body = cleanEmailBody(bodyExtract.body);

      // Determine direction (simplified - in real implementation, compare with user's email)
      const userEmail = credentials.gmail_email || '';
      const direction = from.includes(userEmail) ? 'out' : 'in';

      return {
        id: message.id,
        chat_id: numericChatId ?? chatId,
        provider_msg_id: message.id,
        direction,
        body: body || subject,
        sent_at: new Date(date).toISOString(),
        metadata: {
          subject,
          from,
          to,
          message_id: message.id,
          thread_id: chatId
        }
      };
    });

    const processedMessages = await Promise.all(messagePromises);
    
    // Store messages in database (align with channels_message schema)
    for (const message of processedMessages) {
      await pool.query(
        `INSERT INTO channels_message (chat_id, provider_msg_id, direction, body, sent_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (chat_id, provider_msg_id) 
         DO UPDATE SET 
           direction = EXCLUDED.direction,
           body = EXCLUDED.body,
           sent_at = EXCLUDED.sent_at`,
        [
          numericChatId ?? null,
          message.provider_msg_id,
          message.direction,
          message.body,
          message.sent_at
        ]
      );
    }

    console.log(`📧 Stored ${processedMessages.length} Gmail messages in database`);
    res.json(processedMessages);
  } catch (error: any) {
    console.error('Get Gmail messages error:', error);
    res.status(500).json({ error: 'Failed to get Gmail messages' });
  }
}

/**
 * Send Gmail message
 */
export async function sendGmailMessage(req: AuthRequest, res: Response) {
  try {
    const { accountId, chatId } = req.params;
    const { body, subject, to, cc, bcc, attachments } = req.body;
    const userId = req.user?.id;

    console.log('📧 Sending Gmail message with attachments:', {
      body: body?.substring(0, 50) + '...',
      bodyLength: body?.length || 0,
      subject,
      to,
      toType: typeof to,
      cc,
      ccType: typeof cc,
      bcc,
      bccType: typeof bcc,
      attachmentsCount: attachments?.length || 0,
      attachments: attachments?.map((att: any) => ({ name: att.name, type: att.type, dataLength: att.data?.length }))
    });

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Queue-first: if enabled and not already bypassed, enqueue and return 202
    const bypass = req.headers['x-queue-bypass'];
    const enableQueue = (process.env.ENABLE_EMAIL_QUEUE || 'false').toLowerCase() === 'true';
    if (enableQueue && !bypass && process.env.REDIS_URL) {
      const { enqueueSend } = await import('../services/emailQueue.service');
      const base = process.env.INTERNAL_API_URL || `http://localhost:${process.env.PORT || 3001}/api`;
      const url = `${base}/channels/email/${encodeURIComponent(accountId)}/chats/${encodeURIComponent(chatId)}/send`;
      const token = process.env.INTERNAL_JOB_TOKEN || 'internal-dev-token';
        await enqueueSend('send', {
        provider: 'gmail',
        url,
        method: 'POST',
        body: { body, subject, to, cc, bcc, attachments },
        headers: {
          'x-internal-job': token,
          'x-internal-user': userId,
          'x-queue-bypass': '1',
        },
      });
      return res.status(202).json({ queued: true });
    }

    // Get user's Gmail credentials
    const credentialsResult = await pool.query(
      'SELECT gmail_access_token, gmail_refresh_token, gmail_token_expiry, gmail_email FROM user_credentials WHERE user_id = $1',
      [userId]
    );

    if (credentialsResult.rows.length === 0) {
      return res.status(400).json({ error: 'Gmail credentials not found' });
    }

    const credentials = credentialsResult.rows[0];
    
    // Enforce email rate limits before sending
    // Parse recipients - they might be strings or arrays
    const parseRecipients = (recipients: string | string[] | undefined): string[] => {
      if (!recipients) return [];
      if (Array.isArray(recipients)) return recipients;
      
      // If it's a string, handle email addresses with names properly
      // Split by comma but be careful with email addresses that contain commas in the name part
      const parsed: string[] = [];
      let current = '';
      let inAngleBrackets = false;
      
      for (let i = 0; i < recipients.length; i++) {
        const char = recipients[i];
        
        if (char === '<') {
          inAngleBrackets = true;
          current += char;
        } else if (char === '>') {
          inAngleBrackets = false;
          current += char;
        } else if (char === ',' && !inAngleBrackets) {
          // Only split on comma if we're not inside angle brackets
          if (current.trim()) {
            parsed.push(current.trim());
          }
          current = '';
        } else {
          current += char;
        }
      }
      
      // Add the last recipient
      if (current.trim()) {
        parsed.push(current.trim());
      }
      
      console.log(`📧 Parsing recipients: "${recipients}" -> [${parsed.map(e => `"${e}"`).join(', ')}]`);
      return parsed;
    };
    
    const toList = parseRecipients(to);
    const ccList = parseRecipients(cc);
    const bccList = parseRecipients(bcc);
    
    const allRecipients = [...toList, ...ccList, ...bccList];
    const domains = allRecipients.map(email => email.split('@')[1]).filter(Boolean);
    const attachmentBytes = attachments?.reduce((total: number, att: any) => total + (att.data?.length || 0), 0) || 0;
    
    console.log('📧 Parsed recipients:', {
      originalTo: to,
      toList,
      ccList,
      bccList,
      allRecipients,
      domains,
      recipientCount: allRecipients.length
    });
    
    try {
      await EmailLimitsService.enforceLimits({
        userId,
        mailboxId: accountId,
        to: allRecipients,
        domains,
        isReply: !!chatId, // Consider it a reply if there's a chatId
        attachmentBytes,
      });
    } catch (error: any) {
      console.error('📧 Email rate limit exceeded:', error.message);
      return res.status(402).json({ 
        error: 'Email rate limit exceeded',
        code: error.code,
        message: error.message 
      });
    }
    
    // Check for blocked email addresses (bounces/complaints)
    const { BounceComplaintService } = await import('../services/bounceComplaint.service');
    const blockedRecipients: Array<{ email: string; reason: string }> = [];
    
    for (const recipient of allRecipients) {
      const blockCheck = await BounceComplaintService.shouldBlockEmail(userId, recipient);
      if (blockCheck.blocked) {
        blockedRecipients.push({ email: recipient, reason: blockCheck.reason || 'Blocked' });
      }
    }
    
    if (blockedRecipients.length > 0) {
      console.warn('🚫 Blocked recipients detected:', blockedRecipients);
      return res.status(400).json({
        error: 'Blocked recipients detected',
        message: 'Some recipients are blocked due to bounces or complaints',
        blocked_recipients: blockedRecipients
      });
    }
    
    // Set up OAuth client with stored tokens
    oauth2Client.setCredentials({
      access_token: credentials.gmail_access_token,
      refresh_token: credentials.gmail_refresh_token,
      expiry_date: credentials.gmail_token_expiry
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Build email message with attachments support
    const toField = toList.join(', ');
    const ccField = ccList.length > 0 ? `Cc: ${ccList.join(', ')}\r\n` : '';
    const bccField = bccList.length > 0 ? `Bcc: ${bccList.join(', ')}\r\n` : '';
    
    let emailMessage = '';
    
    if (attachments && attachments.length > 0) {
      console.log('📎 Processing attachments:', attachments.length);
      
      // Validate attachments before processing
      const { validateAttachments } = await import('../services/attachmentValidation.service');
      const validationResult = validateAttachments(attachments);
      
      if (!validationResult.isValid) {
        console.error('❌ Attachment validation failed:', validationResult.errors);
        return res.status(400).json({
          error: 'Invalid attachments',
          details: validationResult.errors.map(e => `${e.filename}: ${e.error}`).join('; '),
          errors: validationResult.errors
        });
      }
      
      if (validationResult.warnings.length > 0) {
        console.warn('⚠️ Attachment validation warnings:', validationResult.warnings);
      }
      
      // Create multipart/mixed message with attachments
      const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      console.log('📎 Using boundary:', boundary);
      
      const headers = [
        `To: ${toField}`,
        ccField,
        bccField,
        `Subject: ${subject || 'No Subject'}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        ''
      ].filter(Boolean).join('\r\n');
      
      // Add text body part - ensure message text is included
      const messageText = body && body.trim() ? body.trim() : 'No message content';
      console.log('📧 Message text being included:', messageText);
      
      const textPart = [
        `--${boundary}`,
        `Content-Type: text/plain; charset=UTF-8`,
        `Content-Transfer-Encoding: 7bit`,
        '',
        messageText,
        ''
      ].join('\r\n');
      
      // Add attachment parts
      const attachmentParts = attachments.map((attachment: any, index: number) => {
        console.log(`📎 Processing attachment ${index + 1}:`, {
          name: attachment.name,
          type: attachment.type,
          dataLength: attachment.data?.length
        });
        
        const attachmentData = Buffer.from(attachment.data, 'base64');
        const encodedAttachment = attachmentData.toString('base64');
        
        console.log(`📎 Attachment ${index + 1} encoded length:`, encodedAttachment.length);
        
        return [
          `--${boundary}`,
          `Content-Type: ${attachment.type || 'application/octet-stream'}`,
          `Content-Disposition: attachment; filename="${attachment.name}"`,
          `Content-Transfer-Encoding: base64`,
          '',
          encodedAttachment,
          ''
        ].join('\r\n');
      });
      
      emailMessage = [
        headers,
        textPart,
        ...attachmentParts,
        `--${boundary}--`
      ].join('\r\n');
    } else {
      // Simple text message without attachments
      emailMessage = [
        `To: ${toField}`,
        ccField,
        bccField,
        `Subject: ${subject || 'No Subject'}`,
        '',
        body
      ].join('\r\n');
    }

    // Encode message
    console.log('📧 Final email message length:', emailMessage.length);
    console.log('📧 Email message preview (first 500 chars):', emailMessage.substring(0, 500));
    const encodedMessage = Buffer.from(emailMessage).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    console.log('📧 Encoded message length:', encodedMessage.length);

    // Send email
    const sendResponse = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
        threadId: chatId // Reply to existing thread if chatId provided
      }
    });

    console.log(`📧 Gmail message sent: ${sendResponse.data.id}`);

    // Store sent message in database
    const messageId = sendResponse.data.id;
    // Resolve numeric chat id for storage
    const chatRow = await pool.query(
      `SELECT id FROM channels_chat WHERE account_id = $1 AND provider_chat_id = $2`,
      [accountId, chatId]
    );
    const numericChatId: number | null = chatRow.rows[0]?.id ?? null;

    const messageBody = body && body.trim() ? body.trim() : 'No message content';
    console.log('📧 Storing message in database with body:', messageBody);
    
    await pool.query(
      `INSERT INTO channels_message (chat_id, provider_msg_id, direction, body, sent_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        numericChatId ?? null,
        messageId,
        'out',
        messageBody, // Store the actual message content
        new Date().toISOString()
      ]
    );

    // Update cooldown timestamps after successful send
    try {
      await EmailLimitsService.updateCooldowns(accountId, allRecipients, domains);
      console.log('📧 Updated email cooldown timestamps');
    } catch (error) {
      console.error('⚠️ Failed to update cooldown timestamps:', error);
      // Don't fail the request for cooldown update errors
    }

    res.json({
      success: true,
      messageId,
      message: 'Email sent successfully'
    });
    try { trackEvent('email_sent', { provider: 'gmail', accountId, chatId }); } catch {}
  } catch (error: any) {
    console.error('Send Gmail message error:', error);
    res.status(500).json({ error: 'Failed to send Gmail message' });
  }
}

/**
 * Mark Gmail messages as read
 */
export async function markGmailAsRead(req: AuthRequest, res: Response) {
  try {
    const { accountId } = req.params;
    const { messageIds } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
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
    
    // Set up OAuth client with stored tokens
    oauth2Client.setCredentials({
      access_token: credentials.gmail_access_token,
      refresh_token: credentials.gmail_refresh_token,
      expiry_date: credentials.gmail_token_expiry
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Mark messages as read (remove UNREAD label)
    for (const messageId of messageIds) {
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD']
        }
      });
    }

    console.log(`📧 Marked ${messageIds.length} Gmail messages as read`);
    res.json({ success: true, message: 'Messages marked as read' });
  } catch (error: any) {
    console.error('Mark Gmail as read error:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
}

/**
 * Set up Gmail watch subscription for real-time notifications
 */
export async function setupGmailWatchSubscription(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
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

    // Store watch information in database
    await pool.query(
      'UPDATE user_credentials SET gmail_watch_expiry = $2, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1',
      [userId, watchResponse.data.expiration]
    );

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
 * Get email usage statistics and limits
 */
export async function getEmailLimits(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { accountId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get usage statistics
    const usageStats = await EmailLimitsService.getUsageStats(accountId);

    res.json({
      success: true,
      limits: usageStats,
      remaining: {
        hour: Math.max(0, usageStats.perHour - usageStats.usedHour),
        day: Math.max(0, usageStats.perDay - usageStats.usedDay)
      }
    });

  } catch (error: any) {
    console.error('❌ Get email limits error:', error);
    res.status(500).json({ error: 'Failed to get email limits' });
  }
}

/**
 * Get aggregated email limits for all user's email accounts
 */
export async function getUserEmailLimits(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`📧 Getting user email limits for user: ${userId}`);

    // Get aggregated usage statistics for all user's email accounts
    const userLimits = await EmailLimitsService.getUserEmailLimits(userId);

    res.json({
      success: true,
      limits: {
        perHour: userLimits.perHour,
        usedHour: userLimits.usedHour,
        perDay: userLimits.perDay,
        usedDay: userLimits.usedDay,
        cooldowns: userLimits.cooldowns
      },
      remaining: {
        hour: Math.max(0, userLimits.perHour - userLimits.usedHour),
        day: Math.max(0, userLimits.perDay - userLimits.usedDay)
      },
      accounts: userLimits.accounts,
      summary: {
        totalAccounts: userLimits.accounts.length,
        hourlyUsage: `${userLimits.usedHour}/${userLimits.perHour}`,
        dailyUsage: `${userLimits.usedDay}/${userLimits.perDay}`,
        hourlyPercentage: Math.round((userLimits.usedHour / userLimits.perHour) * 100),
        dailyPercentage: Math.round((userLimits.usedDay / userLimits.perDay) * 100)
      }
    });

  } catch (error: any) {
    console.error('❌ Get user email limits error:', error);
    res.status(500).json({ error: 'Failed to get user email limits' });
  }
}
