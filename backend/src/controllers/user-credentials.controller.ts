import { Request, Response } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { UniPileService } from '../services/unipile.service';

/**
 * Save user's UniPile credentials
 */
export async function saveCredentials(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { 
      unipileApiKey, 
      unipileApiUrl, 
      whatsappPhoneNumber, 
      webhookUrl 
    } = req.body;

    // Validate required fields
    if (!unipileApiKey) {
      return res.status(400).json({ error: 'UniPile API Key is required' });
    }

    // Test the credentials by trying to fetch accounts
    try {
      const unipileService = UniPileService.createForUser(
        unipileApiKey, 
        unipileApiUrl || 'https://api22.unipile.com:15284/api/v1'
      );
      
      // Test the connection
      await unipileService.getAccounts();
      console.log(`✅ UniPile credentials validated for user: ${userId}`);
    } catch (error: any) {
      console.error(`❌ UniPile credentials validation failed for user: ${userId}`, error.message);
      return res.status(400).json({ 
        error: 'Invalid UniPile credentials', 
        details: error.message 
      });
    }

    // Save or update credentials
    const result = await pool.query(`
      INSERT INTO user_credentials (user_id, unipile_api_key, unipile_api_url, whatsapp_phone_number, webhook_url)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        unipile_api_key = EXCLUDED.unipile_api_key,
        unipile_api_url = EXCLUDED.unipile_api_url,
        whatsapp_phone_number = EXCLUDED.whatsapp_phone_number,
        webhook_url = EXCLUDED.webhook_url,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, user_id, unipile_api_url, whatsapp_phone_number, webhook_url
    `, [userId, unipileApiKey, unipileApiUrl, whatsappPhoneNumber, webhookUrl]);

    res.json({
      success: true,
      message: 'Credentials saved successfully',
      data: result.rows[0]
    });

  } catch (error: any) {
    console.error('Failed to save credentials:', error);
    res.status(500).json({ error: 'Failed to save credentials', details: error.message });
  }
}

/**
 * Get user's UniPile credentials (without sensitive data)
 */
export async function getCredentials(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const result = await pool.query(`
      SELECT id, user_id, unipile_api_url, whatsapp_phone_number, webhook_url, created_at, updated_at
      FROM user_credentials 
      WHERE user_id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.json({ 
        success: true, 
        hasCredentials: false,
        message: 'No credentials found' 
      });
    }

    res.json({
      success: true,
      hasCredentials: true,
      data: result.rows[0]
    });

  } catch (error: any) {
    console.error('Failed to get credentials:', error);
    res.status(500).json({ error: 'Failed to get credentials', details: error.message });
  }
}

/**
 * Get user's UniPile service instance
 */
export async function getUserUniPileService(userId: string): Promise<UniPileService | null> {
  try {
    const result = await pool.query(`
      SELECT unipile_api_key, unipile_api_url
      FROM user_credentials 
      WHERE user_id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return null;
    }

    const { unipile_api_key, unipile_api_url } = result.rows[0];
    
    // Validate that API key exists and is not empty
    if (!unipile_api_key || unipile_api_key.trim() === '') {
      console.warn(`⚠️ Empty or missing UniPile API key for user ${userId}`);
      return null;
    }
    
    return UniPileService.createForUser(unipile_api_key, unipile_api_url);

  } catch (error: any) {
    console.error('Failed to get user UniPile service:', error);
    return null;
  }
}

/**
 * Get user's WhatsApp phone number
 */
export async function getUserWhatsAppPhone(userId: string): Promise<string | null> {
  try {
    const result = await pool.query(`
      SELECT whatsapp_phone_number
      FROM user_credentials 
      WHERE user_id = $1
    `, [userId]);

    return result.rows.length > 0 ? result.rows[0].whatsapp_phone_number : null;

  } catch (error: any) {
    console.error('Failed to get user WhatsApp phone:', error);
    return null;
  }
}
