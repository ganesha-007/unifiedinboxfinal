import { Request, Response } from 'express';
import { unipileService } from '../services/unipile.service';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { getUserUniPileService, getUserWhatsAppPhone } from './user-credentials.controller';
import { getJson, setJson } from '../services/cache';

/**
 * Get all connected accounts for a provider
 */
export async function getAvailableAccounts(req: AuthRequest, res: Response) {
  try {
    const urlParts = req.originalUrl.split('/');
    const provider = urlParts[urlParts.indexOf('channels') + 1];
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get user-specific UniPile service
    const userUniPileService = await getUserUniPileService(userId);
    if (!userUniPileService) {
      return res.status(400).json({ 
        error: 'No UniPile credentials found', 
        message: 'Please configure your UniPile API credentials first' 
      });
    }

    const unipileAccounts = await userUniPileService.getAccounts();
    console.log(`📋 Found ${unipileAccounts.length} UniPile accounts for user ${userId}`);

    // Filter accounts by provider type
    const filteredAccounts = unipileAccounts.filter((account: any) => {
      const accountType = account.type?.toUpperCase();
      return accountType === provider.toUpperCase();
    });

    console.log(`📋 Filtered to ${filteredAccounts.length} ${provider} accounts`);

    // Check which accounts are already connected by any user
    const connectedAccounts = await pool.query(
      'SELECT external_account_id FROM channels_account WHERE provider = $1',
      [provider]
    );
    
    const connectedAccountIds = new Set(connectedAccounts.rows.map(row => row.external_account_id));

    // Return all available accounts with connection status
    const availableAccounts = filteredAccounts.map((account: any) => {
      const isConnected = connectedAccountIds.has(account.id);
      const connectedBy = isConnected ? 'another user' : 'available';
      
      return {
        id: account.id,
        type: account.type,
        name: account.name,
        phone_number: account.connection_params?.im?.phone_number,
        username: account.connection_params?.im?.username,
        status: account.status,
        is_connected: isConnected,
        connected_by: connectedBy,
        unipileData: account
      };
    });

    console.log(`📋 Returning ${availableAccounts.length} available ${provider} accounts`);
    return res.json(availableAccounts);
  } catch (error: any) {
    console.error('Get available accounts error:', error);
    res.status(500).json({ error: 'Failed to fetch available accounts' });
  }
}

export async function getAccounts(req: AuthRequest, res: Response) {
  try {
    // Extract provider from the URL path
    const urlParts = req.originalUrl.split('/');
    const provider = urlParts[urlParts.indexOf('channels') + 1];
    const userId = req.user?.id || 'user_123'; // Use authenticated user ID

    // Try cache first
    const cacheKey = `accounts:${userId}:${provider}`;
    const cached = await getJson<any[]>(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Get accounts from database
    const result = await pool.query(
      'SELECT * FROM channels_account WHERE user_id = $1 AND provider = $2',
      [userId, provider]
    );

    // Enrich with UniPile data for WhatsApp/Instagram
    if (provider === 'whatsapp' || provider === 'instagram') {
      try {
        // Get user-specific UniPile service
        const userUniPileService = await getUserUniPileService(userId);
        if (!userUniPileService) {
          console.log(`⚠️ No UniPile credentials found for user ${userId}, skipping UniPile accounts`);
          // Return empty array instead of error for missing UniPile credentials
          return res.json([]);
        }

        const unipileAccounts = await userUniPileService.getAccounts();
        console.log(`📋 Found ${unipileAccounts.length} UniPile accounts for user ${userId}`);

        // Filter accounts by provider type
        const filteredAccounts = unipileAccounts.filter((account: any) => {
          const accountType = account.type?.toUpperCase();
          return accountType === provider.toUpperCase();
        });

        console.log(`📋 Filtered to ${filteredAccounts.length} ${provider} accounts`);

        // Only show accounts that are connected by the CURRENT user
        // Start with database accounts (only current user's accounts)
        const accountsWithStatus = result.rows.map((dbAccount: any) => {
          // Find the corresponding UniPile account data
          const unipileAccount = filteredAccounts.find((ua: any) => ua.id === dbAccount.external_account_id);
          
          return {
            id: dbAccount.external_account_id,
            type: unipileAccount?.type || provider,
            status: unipileAccount?.status || dbAccount.status,
            display_name: unipileAccount?.display_name || 
                         (unipileAccount?.phone_number ? `+${unipileAccount.phone_number}` : unipileAccount?.username) ||
                         dbAccount.external_account_id,
            phone_number: unipileAccount?.phone_number,
            username: unipileAccount?.username,
            is_connected: true, // All shown accounts are connected by this user
            connected_at: dbAccount.created_at,
            unipileData: unipileAccount
          };
        });

        console.log(`📋 Showing ${accountsWithStatus.length} ${provider} accounts for user ${userId}`);
        console.log(`🔍 DEBUG: Database returned ${result.rows.length} rows for user ${userId}`);
        console.log(`🔍 DEBUG: Final accounts to return:`, accountsWithStatus.map(a => a.id));
        await setJson(cacheKey, accountsWithStatus, 30); // cache for 30s
        return res.json(accountsWithStatus);
      } catch (error: any) {
        console.error('UniPile error:', error);
        return res.status(500).json({ 
          error: 'Failed to fetch UniPile accounts', 
          details: error.message 
        });
      }
    }

    await setJson(cacheKey, result.rows, 30);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Get accounts error:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
}

/**
 * Connect a new account (initiates hosted auth for WhatsApp/Instagram)
 */
export async function connectAccount(req: AuthRequest, res: Response) {
  try {
    // Extract provider from the URL path
    const urlParts = req.originalUrl.split('/');
    const provider = urlParts[urlParts.indexOf('channels') + 1];
    const userId = req.user?.id || 'user_123'; // Use authenticated user ID

    if (provider === 'whatsapp' || provider === 'instagram') {
      try {
        // Get user-specific UniPile service
        const userUniPileService = await getUserUniPileService(userId);
        if (!userUniPileService) {
          console.log(`⚠️ No UniPile credentials found for user ${userId}, skipping UniPile accounts`);
          // Return empty array instead of error for missing UniPile credentials
          return res.json([]);
        }

        // Get actual accounts from user's UniPile
        const unipileAccounts = await userUniPileService.getAccounts();
        console.log('📋 Available UniPile accounts:', JSON.stringify(unipileAccounts, null, 2));
        
        // Debug: Log all account types
        console.log('🔍 Account types found:', unipileAccounts.map((acc: any) => `${acc.type} (${acc.id})`));
        
        // Debug: Check if accounts array is valid
        console.log('🔍 Accounts array length:', unipileAccounts.length);
        console.log('🔍 First account:', unipileAccounts[0]);
        
        // Find the account based on provider type and optional accountId
        let targetAccount;
        const { accountId: requestedAccountId } = req.body;
        
        if (requestedAccountId) {
          // User specified a specific account ID
          targetAccount = unipileAccounts.find((account: any) => 
            account.id === requestedAccountId && account.type === provider.toUpperCase()
          );
          
          if (!targetAccount) {
            return res.status(404).json({ 
              error: 'Account not found',
              message: `Account with ID ${requestedAccountId} not found in your ${provider} accounts`,
              availableAccounts: unipileAccounts.filter((acc: any) => acc.type === provider.toUpperCase())
            });
          }
        } else {
          // Auto-select first available account of the provider type
          if (provider === 'whatsapp') {
            targetAccount = unipileAccounts.find((account: any) => 
              account.type === 'WHATSAPP'
            );
          } else if (provider === 'instagram') {
            targetAccount = unipileAccounts.find((account: any) => 
              account.type === 'INSTAGRAM'
            );
          }
        }
        
        console.log(`🔍 Looking for ${provider} account. Found:`, targetAccount ? `${targetAccount.type} - ${targetAccount.name} (${targetAccount.id})` : 'None');
        
        // Debug: Show all accounts for comparison
        console.log('🔍 All accounts for comparison:');
        unipileAccounts.forEach((acc: any, index: number) => {
          console.log(`  ${index}: ${acc.type} - ${acc.name} (${acc.id})`);
        });
        
        if (!targetAccount) {
          return res.status(404).json({ 
            error: `No ${provider} account found in UniPile`,
            availableAccounts: unipileAccounts
          });
        }
        
        const accountId = targetAccount.id;
        console.log(`✅ Using ${provider} account ID: ${accountId}`);
        
        // Check if account is already connected by another user
        const existingAccount = await pool.query(
          'SELECT user_id FROM channels_account WHERE provider = $1 AND external_account_id = $2',
          [provider, accountId]
        );

        if (existingAccount.rows.length > 0) {
          const existingUserId = existingAccount.rows[0].user_id;
          return res.status(409).json({
            error: 'Account already connected',
            message: `This ${provider} account is already connected by another user (${existingUserId}). Each account can only be connected by one user.`,
            accountId: accountId,
            connectedBy: existingUserId
          });
        }

        // Store in database
        await pool.query(
          `INSERT INTO channels_account (user_id, provider, external_account_id, status)
           VALUES ($1, $2, $3, $4)`,
          [userId, provider, accountId, 'connected']
        );

        // Get display name based on provider
        let displayName = 'Unknown';
        if (provider === 'whatsapp') {
          displayName = targetAccount.connection_params?.im?.phone_number || targetAccount.name || 'Unknown';
        } else if (provider === 'instagram') {
          displayName = targetAccount.connection_params?.im?.username || targetAccount.name || 'Unknown';
        }

        res.json({ 
          success: true, 
          message: `${provider} account connected successfully`,
          accountId,
          displayName,
          accountData: targetAccount
        });
      } catch (error: any) {
        console.error('Failed to get UniPile accounts:', error);
        res.status(500).json({ 
          error: 'Failed to connect to UniPile', 
          details: error.message 
        });
      }
    } else {
      res.status(400).json({ error: 'Unsupported provider' });
    }
  } catch (error: any) {
    console.error('Connect account error:', error);
    res.status(500).json({ error: 'Failed to connect account' });
  }
}

/**
 * Get chats for a specific account
 */
export async function getChats(req: AuthRequest, res: Response) {
  try {
    // Extract provider from the URL path
    const urlParts = req.originalUrl.split('/');
    const provider = urlParts[urlParts.indexOf('channels') + 1];
    const { accountId } = req.params;
    const userId = req.user?.id || 'user_123'; // Use authenticated user ID

    // Verify account belongs to user
    const accountCheck = await pool.query(
      'SELECT id FROM channels_account WHERE user_id = $1 AND provider = $2 AND external_account_id = $3',
      [userId, provider, accountId]
    );

    if (accountCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const dbAccountId = accountCheck.rows[0].id;

    // Get chats from database
    const dbChats = await pool.query(
      'SELECT * FROM channels_chat WHERE account_id = $1 ORDER BY last_message_at DESC',
      [dbAccountId]
    );

    // Fetch fresh data from UniPile
    if (provider === 'whatsapp' || provider === 'instagram') {
      try {
        const unipileChats = await unipileService.getChats(accountId);
        
        // First, clean up existing duplicates in database by phone number
        // Extract phone number from provider_chat_id and deduplicate by that
        await pool.query(`
          DELETE FROM channels_chat 
          WHERE account_id = $1 AND id NOT IN (
            SELECT DISTINCT ON (
              CASE 
                WHEN provider_chat_id LIKE '%@s.whatsapp.net' THEN provider_chat_id
                ELSE metadata::json->>'provider_id'
              END
            ) id 
            FROM channels_chat 
            WHERE account_id = $1 
            ORDER BY 
              CASE 
                WHEN provider_chat_id LIKE '%@s.whatsapp.net' THEN provider_chat_id
                ELSE metadata::json->>'provider_id'
              END, 
              last_message_at DESC,
              id DESC
          )
        `, [dbAccountId]);
        
        // Sync chats to database - deduplicate by provider_id (phone number)
        const uniqueChats = new Map();
        
        for (const chat of unipileChats) {
          const phoneNumber = chat.provider_id || chat.attendee_provider_id;
          
          // Skip if we already have this phone number and current chat is older
          if (uniqueChats.has(phoneNumber)) {
            const existingChat = uniqueChats.get(phoneNumber);
            const existingTime = new Date(existingChat.timestamp || 0).getTime();
            const currentTime = new Date(chat.timestamp || 0).getTime();
            
            if (currentTime <= existingTime) {
              continue; // Skip older chat
            }
          }
          
          uniqueChats.set(phoneNumber, chat);
        }
        
        // Insert unique chats
        for (const chat of uniqueChats.values()) {
          // Safely parse timestamp
          let lastMessageAt: Date;
          try {
            lastMessageAt = chat.timestamp ? new Date(chat.timestamp) : new Date();
            // Check if date is valid
            if (isNaN(lastMessageAt.getTime())) {
              lastMessageAt = new Date();
            }
          } catch (error) {
            console.warn(`Invalid timestamp for chat ${chat.id}:`, chat.timestamp);
            lastMessageAt = new Date();
          }
          
          // Use provider_id as the unique identifier instead of chat.id
          const providerChatId = chat.provider_id || chat.attendee_provider_id || chat.id;
          
          // Generate a better title if chat.name is empty or "Unknown Chat"
          let chatTitle = chat.name;
          if (!chatTitle || chatTitle === 'Unknown Chat' || chatTitle.trim() === '') {
            // Try to extract name from attendees
            if (chat.attendees && chat.attendees.length > 0) {
              const attendee = chat.attendees[0];
              chatTitle = attendee.attendee_name || attendee.attendee_provider_id || 'Unknown Contact';
            } else if (chat.provider_id) {
              // Use phone number as title
              chatTitle = chat.provider_id.replace('@s.whatsapp.net', '');
            } else {
              chatTitle = 'Unknown Contact';
            }
          }
          
          await pool.query(
            `INSERT INTO channels_chat (account_id, provider_chat_id, title, last_message_at, metadata)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (account_id, provider_chat_id) 
             DO UPDATE SET 
               title = CASE WHEN $3 != 'Unknown Contact' THEN $3 ELSE channels_chat.title END,
               last_message_at = $4, 
               metadata = $5, 
               updated_at = CURRENT_TIMESTAMP`,
            [dbAccountId, providerChatId, chatTitle, lastMessageAt, JSON.stringify(chat)]
          );
        }
      } catch (error) {
        console.error('Failed to sync from UniPile:', error);
      }
    }

    // Return updated chats
    const updatedChats = await pool.query(
      'SELECT * FROM channels_chat WHERE account_id = $1 ORDER BY last_message_at DESC',
      [dbAccountId]
    );

    res.json(updatedChats.rows);
  } catch (error: any) {
    console.error('Get chats error:', error);
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
}

/**
 * Get messages for a specific chat
 */
export async function getMessages(req: AuthRequest, res: Response) {
  try {
    // Extract provider from the URL path
    const urlParts = req.originalUrl.split('/');
    const provider = urlParts[urlParts.indexOf('channels') + 1];
    const { accountId, chatId } = req.params;
    const userId = req.user?.id || 'user_123'; // Use authenticated user ID
    const { limit = 50, offset = 0 } = req.query;

    // Verify account belongs to user
    const accountCheck = await pool.query(
      'SELECT id FROM channels_account WHERE user_id = $1 AND provider = $2 AND external_account_id = $3',
      [userId, provider, accountId]
    );

    if (accountCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const dbAccountId = accountCheck.rows[0].id;

    // Get chat from database
    const chatCheck = await pool.query(
      'SELECT id FROM channels_chat WHERE account_id = $1 AND provider_chat_id = $2',
      [dbAccountId, chatId]
    );

    if (chatCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const dbChatId = chatCheck.rows[0].id;

    // Get messages from database
    const messages = await pool.query(
      `SELECT * FROM channels_message 
       WHERE chat_id = $1 
       ORDER BY sent_at DESC 
       LIMIT $2 OFFSET $3`,
      [dbChatId, limit, offset]
    );

    res.json(messages.rows);
  } catch (error: any) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
}

/**
 * Send a message
 */
export async function sendMessage(req: AuthRequest, res: Response) {
  try {
    // Extract provider from the URL path
    const urlParts = req.originalUrl.split('/');
    const provider = urlParts[urlParts.indexOf('channels') + 1];
    const { accountId, chatId } = req.params;
    const userId = req.user?.id || 'user_123'; // Use authenticated user ID
    const { body, attachments } = req.body;

    if (!body) {
      return res.status(400).json({ error: 'Message body is required' });
    }

    // Verify account belongs to user
    const accountCheck = await pool.query(
      'SELECT id FROM channels_account WHERE user_id = $1 AND provider = $2 AND external_account_id = $3',
      [userId, provider, accountId]
    );

    if (accountCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const dbAccountId = accountCheck.rows[0].id;

    // Get chat from database - chatId could be either provider_chat_id or the actual chat id
    let chatCheck = await pool.query(
      'SELECT id, provider_chat_id, metadata FROM channels_chat WHERE account_id = $1 AND provider_chat_id = $2',
      [dbAccountId, chatId]
    );

    // If not found by provider_chat_id, try by the actual UniPile chat ID stored in metadata
    if (chatCheck.rows.length === 0) {
      chatCheck = await pool.query(
        'SELECT id, provider_chat_id, metadata FROM channels_chat WHERE account_id = $1 AND metadata::json->>\'id\' = $2',
        [dbAccountId, chatId]
      );
    }

    if (chatCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const dbChatId = chatCheck.rows[0].id;
    let chatMetadata: any = {};
    try {
      chatMetadata = typeof chatCheck.rows[0].metadata === 'string' 
        ? JSON.parse(chatCheck.rows[0].metadata || '{}')
        : chatCheck.rows[0].metadata || {};
    } catch (error) {
      console.warn('Failed to parse chat metadata:', error);
      chatMetadata = {};
    }
    const unipileChatId = chatMetadata.id || chatId; // Use UniPile chat ID from metadata

    // Send via UniPile
    if (provider === 'whatsapp' || provider === 'instagram') {
      try {
        console.log(`📤 Sending to UniPile chat ID: ${unipileChatId}`);
        const result = await unipileService.sendMessage(accountId, unipileChatId, {
          body,
          attachments: attachments || [],
        });

        // Store in database
        const messageId = result.id || result.message_id || `sent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await pool.query(
          `INSERT INTO channels_message (chat_id, provider_msg_id, direction, body, attachments, sent_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [dbChatId, messageId, 'out', body, JSON.stringify(attachments || []), new Date()]
        );

        // Update usage
        await updateUsage(userId, provider, 'sent');

        res.json({ success: true, messageId: messageId, real: true });
      } catch (error: any) {
        console.error('❌ UniPile send failed:', error.message);
        res.status(500).json({ error: 'Failed to send message', details: error.message });
      }
    } else {
      res.status(400).json({ error: 'Unsupported provider for sending' });
    }
  } catch (error: any) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message', details: error.message });
  }
}

/**
 * Clean up duplicate chats
 */
export async function cleanupDuplicates(req: AuthRequest, res: Response) {
  try {
    const urlParts = req.originalUrl.split('/');
    const provider = urlParts[urlParts.indexOf('channels') + 1];
    const { accountId } = req.params;
    const userId = req.user?.id || 'user_123'; // Use authenticated user ID

    // Verify account belongs to user
    const accountCheck = await pool.query(
      'SELECT id FROM channels_account WHERE user_id = $1 AND provider = $2 AND external_account_id = $3',
      [userId, provider, accountId]
    );

    if (accountCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const dbAccountId = accountCheck.rows[0].id;

    // Clean up duplicates - keep only the most recent chat for each phone number
    const result = await pool.query(`
      DELETE FROM channels_chat 
      WHERE account_id = $1 AND id NOT IN (
        SELECT DISTINCT ON (
          CASE 
            WHEN provider_chat_id LIKE '%@s.whatsapp.net' THEN provider_chat_id
            ELSE metadata::json->>'provider_id'
          END
        ) id 
        FROM channels_chat 
        WHERE account_id = $1 
        ORDER BY 
          CASE 
            WHEN provider_chat_id LIKE '%@s.whatsapp.net' THEN provider_chat_id
            ELSE metadata::json->>'provider_id'
          END, 
          last_message_at DESC,
          id DESC
      )
    `, [dbAccountId]);

    console.log(`🧹 Cleaned up ${result.rowCount} duplicate chats for account ${accountId}`);

    res.json({ 
      success: true, 
      message: `Cleaned up ${result.rowCount} duplicate chats`,
      duplicatesRemoved: result.rowCount 
    });
  } catch (error: any) {
    console.error('Cleanup duplicates error:', error);
    res.status(500).json({ error: 'Failed to cleanup duplicates' });
  }
}

/**
 * Clean up unknown chats
 */
export async function cleanupUnknownChats(req: AuthRequest, res: Response) {
  try {
    const urlParts = req.originalUrl.split('/');
    const provider = urlParts[urlParts.indexOf('channels') + 1];
    const { accountId } = req.params;
    const userId = req.user?.id || 'user_123'; // Use authenticated user ID

    // Verify account belongs to user
    const accountCheck = await pool.query(
      'SELECT id FROM channels_account WHERE user_id = $1 AND provider = $2 AND external_account_id = $3',
      [userId, provider, accountId]
    );

    if (accountCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const dbAccountId = accountCheck.rows[0].id;

    // Delete all chats with title "Unknown Chat" or "Unknown Contact"
    const result = await pool.query(`
      DELETE FROM channels_chat 
      WHERE account_id = $1 AND (title = 'Unknown Chat' OR title = 'Unknown Contact')
    `, [dbAccountId]);

    console.log(`🧹 Cleaned up ${result.rowCount} unknown chats for account ${accountId}`);

    res.json({ 
      success: true, 
      message: `Cleaned up ${result.rowCount} unknown chats`,
      unknownChatsRemoved: result.rowCount 
    });
  } catch (error: any) {
    console.error('Cleanup unknown chats error:', error);
    res.status(500).json({ error: 'Failed to cleanup unknown chats' });
  }
}

/**
 * Mark messages as read
 */
export async function markAsRead(req: AuthRequest, res: Response) {
  try {
    const { provider, accountId, chatId } = req.params;
    const userId = req.user?.id || 'user_123'; // Use authenticated user ID

    // Verify account belongs to user
    const accountCheck = await pool.query(
      'SELECT id FROM channels_account WHERE user_id = $1 AND provider = $2 AND external_account_id = $3',
      [userId, provider, accountId]
    );

    if (accountCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Mark as read via UniPile
    if (provider === 'whatsapp' || provider === 'instagram') {
      await unipileService.markAsRead(accountId, chatId);
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Unsupported provider' });
    }
  } catch (error: any) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
}

/**
 * Debug endpoint to test UniPile API connectivity
 */
export async function debugUniPile(req: any, res: Response) {
  try {
    console.log('🔍 Testing UniPile API connectivity...');
    
    // Test getting accounts
    const accounts = await unipileService.getAccounts();
    console.log('📋 UniPile accounts response:', JSON.stringify(accounts, null, 2));
    
    res.json({
      success: true,
      accounts: accounts,
      accountCount: accounts.length,
      whatsappAccounts: accounts.filter((acc: any) => 
        acc.type === 'WHATSAPP'
      )
    });
  } catch (error: any) {
    console.error('❌ UniPile API test failed:', error);
    res.status(500).json({
      error: 'UniPile API test failed',
      details: error.message,
      response: error.response?.data,
      stack: error.stack
    });
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

