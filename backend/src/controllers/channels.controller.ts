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
        // Get user-specific UniPile service
        const userUniPileService = await getUserUniPileService(userId);
        if (!userUniPileService) {
          console.log(`⚠️ No UniPile credentials found for user ${userId}, skipping UniPile chat sync`);
          // Return database chats only
          return res.json(dbChats.rows);
        }

        const unipileChats = await userUniPileService.getChats(accountId);
        console.log(`📥 Fetched ${unipileChats.length} chats from UniPile for ${provider} account ${accountId}`);
        
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
          
          // Store metadata with UniPile chat ID at root level for easy access
          const chatMetadata = {
            id: chat.id, // UniPile chat ID - this is what we need for sending messages
            provider_chat_id: providerChatId,
            provider_id: chat.provider_id || chat.attendee_provider_id,
            fullData: chat // Store full chat data for reference
          };
          
          await pool.query(
            `INSERT INTO channels_chat (account_id, provider_chat_id, title, last_message_at, metadata)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (account_id, provider_chat_id) 
             DO UPDATE SET 
               title = CASE WHEN $3 != 'Unknown Contact' THEN $3 ELSE channels_chat.title END,
               last_message_at = $4, 
               metadata = $5, 
               updated_at = CURRENT_TIMESTAMP`,
            [dbAccountId, providerChatId, chatTitle, lastMessageAt, JSON.stringify(chatMetadata)]
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
      'SELECT id, metadata FROM channels_chat WHERE account_id = $1 AND provider_chat_id = $2',
      [dbAccountId, chatId]
    );

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
    }

    // Sync messages from UniPile for WhatsApp/Instagram
    if (provider === 'whatsapp' || provider === 'instagram') {
      try {
        // Get user-specific UniPile service
        const userUniPileService = await getUserUniPileService(userId);
        if (userUniPileService) {
          // Get the UniPile chat ID from metadata or use chatId directly
          const unipileChatId = chatMetadata.id || chatId;
          
          console.log(`🔄 Syncing messages from UniPile for ${provider} chat: ${unipileChatId}`);
          
          // Fetch messages from UniPile
          const unipileMessages = await userUniPileService.getMessages(accountId, unipileChatId, {
            limit: parseInt(limit as string) || 50,
            offset: parseInt(offset as string) || 0
          });

          console.log(`📥 Fetched ${unipileMessages.length} messages from UniPile for chat ${unipileChatId}`);

          // Get user's WhatsApp phone for direction detection (if WhatsApp)
          let accountOwnerPhone = '';
          if (provider === 'whatsapp') {
            const userWhatsAppPhone = await getUserWhatsAppPhone(userId);
            accountOwnerPhone = userWhatsAppPhone || process.env.WHATSAPP_PHONE_NUMBER || '';
          }

          // Sync messages to database
          for (const unipileMsg of unipileMessages) {
            try {
              // Determine message direction
              let messageDirection = 'in'; // Default to incoming
              
              if (provider === 'whatsapp') {
                const senderPhone = unipileMsg.from?.phone || unipileMsg.sender?.attendee_provider_id || '';
                messageDirection = senderPhone === accountOwnerPhone ? 'out' : 'in';
              } else if (provider === 'instagram') {
                // For Instagram, check if sender is account owner
                const senderId = unipileMsg.sender?.attendee_provider_id || unipileMsg.from?.phone || '';
                const senderName = unipileMsg.sender?.attendee_name || '';
                // We'd need account info to check owner, but default to 'in' for now
                // This could be enhanced by storing account owner info
                messageDirection = 'in'; // Default to incoming for Instagram
              }

              // Store message in database
              await pool.query(
                `INSERT INTO channels_message (chat_id, provider_msg_id, direction, body, attachments, sent_at)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (chat_id, provider_msg_id) 
                 DO UPDATE SET 
                   direction = EXCLUDED.direction,
                   body = EXCLUDED.body,
                   attachments = EXCLUDED.attachments,
                   sent_at = EXCLUDED.sent_at,
                   updated_at = CURRENT_TIMESTAMP`,
                [
                  dbChatId,
                  unipileMsg.id || `unipile_${Date.now()}_${Math.random()}`,
                  messageDirection,
                  unipileMsg.body || unipileMsg.text || '',
                  JSON.stringify(unipileMsg.attachments || []),
                  unipileMsg.timestamp ? new Date(unipileMsg.timestamp) : new Date()
                ]
              );
            } catch (msgError: any) {
              console.error(`Failed to sync message ${unipileMsg.id}:`, msgError);
              // Continue with other messages
            }
          }

          console.log(`✅ Synced messages from UniPile for ${provider} chat ${unipileChatId}`);
        }
      } catch (error: any) {
        console.error(`Failed to sync messages from UniPile for ${provider}:`, error);
        // Continue to return database messages even if sync fails
      }
    }

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
    // Determine the correct UniPile chat ID to use
    // Priority: 1. Chat metadata id (UniPile chat ID), 2. provider_chat_id (if it's a valid UniPile chat ID), 3. chatId param
    let unipileChatId = chatMetadata.id;
    
    // If no id in metadata, check if provider_chat_id might be the UniPile chat ID
    if (!unipileChatId) {
      // For WhatsApp, provider_chat_id is usually a phone number, so we need the UniPile chat ID
      // For Instagram, provider_chat_id might be the username, so we also need the UniPile chat ID
      // Try to get it from UniPile by fetching chats
      try {
        const userUniPileService = await getUserUniPileService(userId);
        if (userUniPileService) {
          console.log(`🔍 Looking up UniPile chat ID for provider_chat_id: ${chatCheck.rows[0].provider_chat_id}`);
          const unipileChats = await userUniPileService.getChats(accountId);
          
          // Try to find the chat by provider_chat_id or by matching attendees
          const matchingChat = unipileChats.find((chat: any) => {
            const chatProviderId = chat.provider_id || chat.attendee_provider_id;
            const dbProviderChatId = chatCheck.rows[0].provider_chat_id;
            
            // Match by provider_id/attendee_provider_id
            if (chatProviderId === dbProviderChatId) {
              return true;
            }
            
            // Match by chat.id (UniPile chat ID)
            if (chat.id === dbProviderChatId) {
              return true;
            }
            
            // For Instagram, also check username/name in attendees
            if (provider === 'instagram') {
              if (chat.attendees && chat.attendees.length > 0) {
                const attendee = chat.attendees[0];
                if (attendee.attendee_name === dbProviderChatId || 
                    attendee.attendee_provider_id === dbProviderChatId) {
                  return true;
                }
              }
            }
            
            return false;
          });
          
          if (matchingChat) {
            unipileChatId = matchingChat.id;
            console.log(`✅ Found UniPile chat ID: ${unipileChatId} for provider_chat_id: ${chatCheck.rows[0].provider_chat_id}`);
            
            // Update chat metadata with the UniPile chat ID for future use
            const updatedMetadata = { 
              ...chatMetadata, 
              id: unipileChatId,
              provider_chat_id: chatCheck.rows[0].provider_chat_id,
              fullData: matchingChat
            };
            await pool.query(
              'UPDATE channels_chat SET metadata = $1 WHERE id = $2',
              [JSON.stringify(updatedMetadata), dbChatId]
            );
          } else {
            console.warn(`⚠️ Could not find matching chat in UniPile for provider_chat_id: ${chatCheck.rows[0].provider_chat_id}`);
            console.warn(`⚠️ Available UniPile chats:`, unipileChats.map((c: any) => ({
              id: c.id,
              provider_id: c.provider_id || c.attendee_provider_id,
              name: c.name
            })));
            
            // Fallback: Try using chatId parameter if it looks like a UniPile chat ID
            // UniPile chat IDs are typically alphanumeric strings
            if (chatId && /^[a-zA-Z0-9_-]+$/.test(chatId) && chatId.length > 5) {
              unipileChatId = chatId;
              console.log(`⚠️ Using chatId parameter as UniPile chat ID: ${unipileChatId}`);
              
              // Try to verify this chat ID exists in UniPile
              const chatExists = unipileChats.some((c: any) => c.id === chatId);
              if (!chatExists) {
                console.error(`❌ Chat ID ${chatId} not found in UniPile chats`);
                // Try provider_chat_id as last resort
                unipileChatId = chatCheck.rows[0].provider_chat_id;
                console.log(`⚠️ Falling back to provider_chat_id: ${unipileChatId}`);
              }
            } else {
              // Last resort: use provider_chat_id directly (might work for some cases)
              unipileChatId = chatCheck.rows[0].provider_chat_id;
              console.log(`⚠️ Using provider_chat_id as UniPile chat ID (last resort): ${unipileChatId}`);
            }
          }
        } else {
          unipileChatId = chatId;
        }
      } catch (lookupError: any) {
        console.error(`⚠️ Failed to lookup UniPile chat ID:`, lookupError);
        unipileChatId = chatId; // Fallback
      }
    }

    console.log(`📤 Determined UniPile chat ID: ${unipileChatId} (from metadata: ${chatMetadata.id}, fallback: ${chatId})`);
    console.log(`📤 Chat details:`, {
      dbChatId,
      providerChatId: chatCheck.rows[0].provider_chat_id,
      unipileChatId,
      chatMetadata
    });

    // Send via UniPile
    if (provider === 'whatsapp' || provider === 'instagram') {
      try {
        // Get user-specific UniPile service
        const userUniPileService = await getUserUniPileService(userId);
        if (!userUniPileService) {
          console.error('❌ No UniPile credentials found for user:', userId);
          return res.status(400).json({ 
            error: 'No UniPile credentials found', 
            message: 'Please configure your UniPile API credentials first' 
          });
        }

        // Validate that we have a valid chat ID
        if (!unipileChatId || unipileChatId.trim() === '') {
          console.error('❌ Invalid UniPile chat ID:', unipileChatId);
          return res.status(400).json({ 
            error: 'Invalid chat ID', 
            message: 'Could not determine the correct UniPile chat ID for sending messages' 
          });
        }

        console.log(`📤 Sending ${provider} message via UniPile:`, {
          userId,
          accountId,
          unipileChatId,
          providerChatId: chatCheck.rows[0].provider_chat_id,
          body,
          endpoint: `/chats/${unipileChatId}/messages`
        });

        const result = await userUniPileService.sendMessage(accountId, unipileChatId, {
          body,
          attachments: attachments || [],
        });

        console.log(`✅ ${provider} message sent successfully:`, result);

        // Store in database
        const messageId = result.id || result.message_id || `sent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await pool.query(
          `INSERT INTO channels_message (chat_id, provider_msg_id, direction, body, attachments, sent_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (chat_id, provider_msg_id) DO UPDATE SET
             body = EXCLUDED.body,
             attachments = EXCLUDED.attachments,
             sent_at = EXCLUDED.sent_at,
             updated_at = CURRENT_TIMESTAMP`,
          [dbChatId, messageId, 'out', body, JSON.stringify(attachments || []), new Date()]
        );

        // Update chat's last_message_at
        await pool.query(
          'UPDATE channels_chat SET last_message_at = $1 WHERE id = $2',
          [new Date(), dbChatId]
        );

        // Update usage
        await updateUsage(userId, provider, 'sent');

        // Emit real-time notification to frontend
        const io = req.app.get('io');
        if (io) {
          const messageData = {
            id: messageId,
            body: body,
            direction: 'out',
            sent_at: new Date().toISOString(),
            chat_id: dbChatId,
            provider_chat_id: chatId
          };
          
          io.to(`user:${userId}`).emit('new_message', {
            chatId: chatId,
            message: messageData
          });
          
          io.to(`chat:${chatId}`).emit('new_message', {
            chatId: chatId,
            message: messageData
          });
          
          console.log(`📡 Emitted new_message event for sent message to user:${userId} and chat:${chatId}`);
        }

        res.json({ success: true, messageId: messageId, real: true });
      } catch (error: any) {
        console.error(`❌ ${provider} send failed:`, error);
        console.error(`❌ Error details:`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message
        });
        res.status(500).json({ 
          error: 'Failed to send message', 
          details: error.message,
          response: error.response?.data 
        });
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

