import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { pool } from '../config/database';
import { Server as SocketIOServer } from 'socket.io';
import { getUserWhatsAppPhone, getUserUniPileService } from './user-credentials.controller';

/**
 * Validate account type consistency
 */
async function validateAccountTypeConsistency(accountId: string, detectedProvider: string): Promise<boolean> {
  try {
    // Check if account already exists with different provider
    const existingAccount = await pool.query(
      'SELECT provider FROM channels_account WHERE external_account_id = $1',
      [accountId]
    );
    
    if (existingAccount.rows.length > 0) {
      const existingProvider = existingAccount.rows[0].provider;
      if (existingProvider !== detectedProvider) {
        console.warn(`⚠️ Account type mismatch detected: ${accountId} is ${existingProvider} but detected as ${detectedProvider}`);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error validating account type consistency:', error);
    return false;
  }
}

/**
 * Check data consistency across all accounts
 */
export async function checkDataConsistency(req: any, res: Response) {
  try {
    console.log('🔍 Running data consistency check...');
    
    // Find accounts with potential inconsistencies
    const inconsistentAccounts = await pool.query(`
      SELECT 
        ca.user_id,
        ca.provider,
        ca.external_account_id,
        COUNT(cc.id) as chat_count,
        COUNT(CASE WHEN cc.metadata->>'account_type' != ca.provider THEN 1 END) as inconsistent_chats
      FROM channels_account ca
      LEFT JOIN channels_chat cc ON ca.id = cc.account_id
      GROUP BY ca.id, ca.user_id, ca.provider, ca.external_account_id
      HAVING COUNT(CASE WHEN cc.metadata->>'account_type' != ca.provider THEN 1 END) > 0
    `);
    
    console.log(`Found ${inconsistentAccounts.rows.length} potentially inconsistent accounts`);
    
    res.json({
      success: true,
      inconsistent_accounts: inconsistentAccounts.rows,
      total_inconsistent: inconsistentAccounts.rows.length
    });
  } catch (error: any) {
    console.error('Data consistency check error:', error);
    res.status(500).json({ error: 'Failed to check data consistency' });
  }
}

/**
 * Handle incoming messages from UniPile webhook
 */
export async function handleUniPileMessage(req: any, res: Response) {
  try {
    // Log the raw body for debugging
    console.log('📥 Webhook received - Raw body length:', req.body ? Object.keys(req.body).length : 'no body');
    
    // Check if body is valid
    if (!req.body || typeof req.body !== 'object') {
      console.warn('⚠️ Invalid webhook body received');
      return res.status(400).json({ error: 'Invalid request body' });
    }
    
    console.log('📥 Webhook received:', JSON.stringify(req.body, null, 2));
    
    // Handle webhook verification (if UniPile sends a challenge)
    if (req.body.challenge) {
      console.log('🔐 Webhook verification challenge received');
      return res.json({ challenge: req.body.challenge });
    }
    
    const { event, data } = req.body;

    // Handle multiple possible UniPile webhook formats
    if (event === 'message.new' || event === 'message_received' || req.body.message_id || req.body.account_id) {
      let account_id, chat_id, message;
      
      // UniPile webhook format - check for direct properties first
      if (req.body.account_id && (req.body.message_id || req.body.text)) {
        account_id = req.body.account_id;
        chat_id = req.body.chat_id || req.body.provider_chat_id;
        message = {
          id: req.body.message_id || req.body.id,
          body: req.body.text || req.body.message || req.body.body,
          text: req.body.text || req.body.message || req.body.body,
          from: {
            name: req.body.sender?.attendee_name || req.body.from?.name || req.body.sender_name || 'Unknown',
            phone: req.body.sender?.attendee_provider_id || req.body.from?.phone || req.body.sender_id || ''
          },
          timestamp: req.body.timestamp || req.body.created_at || new Date().toISOString(),
          attachments: req.body.attachments || []
        };
      } else if (data && data.account_id) {
        // Nested data format
        account_id = data.account_id;
        chat_id = data.chat_id;
        message = data.message;
      } else {
        console.warn('Unknown webhook format:', req.body);
        return res.status(200).json({ received: true });
      }
      

      // Find the account in our database, create if not exists
      let accountResult = await pool.query(
        'SELECT id, provider, user_id FROM channels_account WHERE external_account_id = $1',
        [account_id]
      );

      let provider = 'whatsapp'; // Default to whatsapp for backward compatibility
      
      if (accountResult.rows.length === 0) {
        console.log(`📝 Account ${account_id} not found, creating it automatically...`);
        
        // Try to determine provider from UniPile account data using user-specific service
        try {
          // First, try to find which user this account belongs to by checking existing accounts
          const existingAccount = await pool.query(
            'SELECT user_id FROM channels_account WHERE external_account_id = $1',
            [account_id]
          );
          
          if (existingAccount.rows.length > 0) {
            const userId = existingAccount.rows[0].user_id;
            console.log(`🔍 Found existing user ${userId} for account ${account_id}, using user-specific service`);
            
            // Use user-specific UniPile service
            const userUniPileService = await getUserUniPileService(userId);
            if (userUniPileService) {
              const unipileAccounts = await userUniPileService.getAccounts();
              const unipileAccount = unipileAccounts.find((acc: any) => acc.id === account_id);
              
              if (unipileAccount) {
                if (unipileAccount.type === 'INSTAGRAM') {
                  provider = 'instagram';
                } else if (unipileAccount.type === 'WHATSAPP') {
                  provider = 'whatsapp';
                }
                console.log(`🔍 Detected provider: ${provider} for account ${account_id} using user-specific service`);
              }
            }
          } else {
            console.log(`⚠️ No existing user found for account ${account_id}, using fallback detection`);
            // Fallback to global service only if no user found
            const unipileService = require('../services/unipile.service').unipileService;
            const unipileAccounts = await unipileService.getAccounts();
            const unipileAccount = unipileAccounts.find((acc: any) => acc.id === account_id);
            
            if (unipileAccount) {
              if (unipileAccount.type === 'INSTAGRAM') {
                provider = 'instagram';
              } else if (unipileAccount.type === 'WHATSAPP') {
                provider = 'whatsapp';
              }
              console.log(`🔍 Detected provider: ${provider} for account ${account_id} using global service (fallback)`);
            }
          }
        } catch (error: any) {
          console.warn('Could not determine provider from UniPile, defaulting to whatsapp:', error.message);
        }
        
        // Create the account with a dynamic user ID based on account data
        // In production, you should determine the user ID based on the account
        // For now, we'll use a pattern based on the account ID for uniqueness
        const defaultUserId = `user_${req.body.account_id.substring(0, 8)}`; // Dynamic based on account ID
        
        // Validate account type consistency before creating
        const isConsistent = await validateAccountTypeConsistency(account_id, provider);
        if (!isConsistent) {
          console.error(`❌ Account type inconsistency detected for ${account_id}, skipping creation`);
          return res.status(400).json({ 
            error: 'Account type inconsistency detected',
            message: `Account ${account_id} has conflicting provider types`
          });
        }
        
        // Validate account type before creating
        console.log(`🔍 Creating account with provider: ${provider} for user: ${defaultUserId}`);
        
        const newAccount = await pool.query(
          `INSERT INTO channels_account (user_id, provider, external_account_id, status)
           VALUES ($1, $2, $3, $4)
           RETURNING id, provider`,
          [defaultUserId, provider, account_id, 'connected']
        );
        
        accountResult = newAccount;
        console.log(`✅ Created ${provider} account ${account_id} for user ${defaultUserId}`);
      } else {
        provider = accountResult.rows[0].provider;
      }

      const dbAccountId = accountResult.rows[0].id;

      // Find or create chat using the actual provider_chat_id from webhook
      const actualProviderChatId = req.body.provider_chat_id || chat_id;
      let chatResult = await pool.query(
        'SELECT id FROM channels_chat WHERE account_id = $1 AND provider_chat_id = $2',
        [dbAccountId, actualProviderChatId]
      );

      let dbChatId: number;
      
      if (chatResult.rows.length === 0) {
        // Create chat metadata with UniPile chat ID
        const chatMetadata = {
          id: chat_id, // Store the UniPile chat ID - this is critical for sending messages
          provider_chat_id: actualProviderChatId,
          provider_id: req.body.provider_chat_id || req.body.sender?.attendee_provider_id || message.from?.phone,
          created_from_webhook: true
        };
        
        const newChat = await pool.query(
          `INSERT INTO channels_chat (account_id, provider_chat_id, title, last_message_at, metadata)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [dbAccountId, actualProviderChatId, message.from?.name || 'Unknown', new Date(message.timestamp), JSON.stringify(chatMetadata)]
        );
        dbChatId = newChat.rows[0].id;
        console.log(`✅ Created new chat with UniPile chat ID: ${chat_id}, provider_chat_id: ${actualProviderChatId}`);
      } else {
        dbChatId = chatResult.rows[0].id;
        
        // Update metadata to ensure UniPile chat ID is stored
        let existingMetadata: any = {};
        try {
          const existingChat = await pool.query(
            'SELECT metadata FROM channels_chat WHERE id = $1',
            [dbChatId]
          );
          if (existingChat.rows[0]?.metadata) {
            existingMetadata = typeof existingChat.rows[0].metadata === 'string'
              ? JSON.parse(existingChat.rows[0].metadata)
              : existingChat.rows[0].metadata;
          }
        } catch (e) {
          console.warn('Failed to parse existing chat metadata:', e);
        }
        
        // If metadata doesn't have the UniPile chat ID, update it
        if (!existingMetadata.id || existingMetadata.id !== chat_id) {
          const updatedMetadata = {
            ...existingMetadata,
            id: chat_id, // Ensure UniPile chat ID is stored
            provider_chat_id: actualProviderChatId
          };
          await pool.query(
            'UPDATE channels_chat SET metadata = $1 WHERE id = $2',
            [JSON.stringify(updatedMetadata), dbChatId]
          );
          console.log(`✅ Updated chat metadata with UniPile chat ID: ${chat_id}`);
        }
      }

      // Determine message direction based on sender and provider
      let messageDirection = 'in'; // Default to incoming
      
      if (provider === 'whatsapp') {
        // Get the account owner's phone number from user credentials
        const userId = accountResult.rows[0]?.user_id;
        let accountOwnerPhone = process.env.WHATSAPP_PHONE_NUMBER || '919566651479@s.whatsapp.net'; // Fallback
        
        if (userId) {
          const userWhatsAppPhone = await getUserWhatsAppPhone(userId);
          if (userWhatsAppPhone) {
            accountOwnerPhone = userWhatsAppPhone;
          }
        }
        
        const senderPhone = req.body.sender?.attendee_provider_id || message.from?.phone || '';
        messageDirection = senderPhone === accountOwnerPhone ? 'out' : 'in';
        console.log(`📤 WhatsApp message direction: ${messageDirection} (sender: ${senderPhone}, owner: ${accountOwnerPhone})`);
      } else if (provider === 'instagram') {
        // For Instagram, check if the sender is the account owner
        const senderId = req.body.sender?.attendee_provider_id || message.from?.phone || '';
        const accountOwnerId = req.body.account_info?.user_id || '';
        
        // Debug: Log all the IDs we're comparing
        console.log(`🔍 Instagram IDs - Sender: ${senderId}, Account Owner: ${accountOwnerId}, Account ID: ${account_id}`);
        console.log(`🔍 Instagram sender name: ${req.body.sender?.attendee_name}, account username: ${req.body.account_info?.username}`);
        
        // For Instagram, we can also check by sender name matching account username
        const senderName = req.body.sender?.attendee_name || '';
        const accountUsername = req.body.account_info?.username || '';
        
        // If sender ID matches account owner ID OR sender name matches account username, it's outgoing
        if (senderId === accountOwnerId || senderName === accountUsername) {
          messageDirection = 'out';
        } else {
          messageDirection = 'in';
        }
        
        console.log(`📤 Instagram message direction: ${messageDirection} (sender: ${senderId}/${senderName}, owner: ${accountOwnerId}/${accountUsername})`);
      }

      // Skip storing outgoing messages in webhook - they're already stored when sent via API
      if (messageDirection === 'out') {
        console.log(`⏭️ Skipping outgoing message in webhook: ${message.id}`);
        return res.json({ received: true, skipped: 'outgoing message' });
      }

      // Store the message
      await pool.query(
        `INSERT INTO channels_message (chat_id, provider_msg_id, direction, body, attachments, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (chat_id, provider_msg_id) DO NOTHING`,
        [
          dbChatId,
          message.id,
          messageDirection,
          message.body || message.text,
          JSON.stringify(message.attachments || []),
          new Date(message.timestamp)
        ]
      );

      // Update chat's last_message_at
      await pool.query(
        'UPDATE channels_chat SET last_message_at = $1 WHERE id = $2',
        [new Date(message.timestamp), dbChatId]
      );

      // Update usage
      const userId = await getUserIdFromAccount(dbAccountId);
      if (userId) {
        await updateUsage(userId, provider, 'received');
      }

      console.log(`✅ Stored incoming message: ${message.id}`);
      
      // Emit real-time notification to frontend
      const io = req.app.get('io');
      if (io) {
        // Get user ID from account
        const userId = await getUserIdFromAccount(dbAccountId);
        if (userId) {
          const messageData = {
            id: message.id,
            body: message.body || message.text,
            direction: messageDirection,
            sent_at: message.timestamp,
            from: message.from,
            chat_id: dbChatId,
            provider_chat_id: actualProviderChatId
          };
          
          // Emit to both user room and specific chat room for immediate updates
          io.to(`user:${userId}`).emit('new_message', {
            chatId: actualProviderChatId, // Use provider chat ID for frontend matching
            message: messageData
          });
          
          // Also emit to specific chat room if anyone is viewing that chat
          io.to(`chat:${actualProviderChatId}`).emit('new_message', {
            chatId: actualProviderChatId,
            message: messageData
          });
          
          console.log(`📡 Emitted new_message event to user:${userId} and chat:${actualProviderChatId}`);
        }
      }
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('❌ Webhook message error:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Request body:', JSON.stringify(req.body, null, 2));
    res.status(500).json({ error: 'Webhook processing failed', details: error.message });
  }
}

/**
 * Handle account status updates from UniPile webhook
 */
export async function handleUniPileAccountStatus(req: any, res: Response) {
  try {
    const { event, data } = req.body;

    if (event === 'account.update') {
      const { account_id, status } = data;

      // Update account status in database
      await pool.query(
        'UPDATE channels_account SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE external_account_id = $2',
        [status, account_id]
      );

      console.log(`✅ Updated account status: ${account_id} -> ${status}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('Webhook account status error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

/**
 * Helper function to get user ID from account ID
 */
async function getUserIdFromAccount(accountId: number): Promise<string | null> {
  const result = await pool.query(
    'SELECT user_id FROM channels_account WHERE id = $1',
    [accountId]
  );
  return result.rows.length > 0 ? result.rows[0].user_id : null;
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

