import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { pool } from '../config/database';
import { getEntitlements } from '../config/pricing';

// Monthly usage limits per provider (can be configured via environment variables)
const MONTHLY_LIMITS = {
  whatsapp: parseInt(process.env.WHATSAPP_MONTHLY_LIMIT || '5000'),
  instagram: parseInt(process.env.INSTAGRAM_MONTHLY_LIMIT || '5000'),
  email: parseInt(process.env.EMAIL_MONTHLY_LIMIT || '10000'),
  outlook: parseInt(process.env.OUTLOOK_MONTHLY_LIMIT || '10000'),
};

interface UsageLimitError extends Error {
  code: string;
  statusCode: number;
  remaining?: number;
  limit?: number;
}

/**
 * Middleware to enforce monthly usage limits before allowing message sending
 */
export function enforceUsageLimits(provider: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const userId = req.user.id;
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      console.log(`🔍 Checking usage limits for user ${userId}, provider ${provider}, month ${currentMonth}`);

      // 1. Check if user has entitlement for this provider
      const entitlements = await getEntitlements(userId, pool);
      if (!entitlements[provider]) {
        return res.status(403).json({
          error: 'Access denied',
          message: `You don't have access to ${provider}. Please upgrade your plan.`,
          code: 'NO_ENTITLEMENT'
        });
      }

      // 2. Get current month's usage
      const usageResult = await pool.query(
        `SELECT messages_sent, messages_rcvd 
         FROM channels_usage 
         WHERE user_id = $1 AND provider = $2 AND period_ym = $3`,
        [userId, provider, currentMonth]
      );

      const currentUsage = usageResult.rows[0] || { messages_sent: 0, messages_rcvd: 0 };
      const monthlyLimit = MONTHLY_LIMITS[provider as keyof typeof MONTHLY_LIMITS];

      console.log(`📊 Current usage: ${currentUsage.messages_sent}/${monthlyLimit} messages sent`);

      // 3. Check if user has exceeded monthly limit
      if (currentUsage.messages_sent >= monthlyLimit) {
        const error: UsageLimitError = new Error(
          `Monthly limit exceeded for ${provider}. You have sent ${currentUsage.messages_sent}/${monthlyLimit} messages this month.`
        ) as UsageLimitError;
        error.code = 'MONTHLY_LIMIT_EXCEEDED';
        error.statusCode = 402;
        error.remaining = 0;
        error.limit = monthlyLimit;

        return res.status(402).json({
          error: 'Monthly limit exceeded',
          message: error.message,
          code: error.code,
          usage: {
            sent: currentUsage.messages_sent,
            limit: monthlyLimit,
            remaining: 0
          },
          resetDate: getNextMonthResetDate(now)
        });
      }

      // 4. Check if user is approaching limit (90% threshold)
      const usagePercentage = (currentUsage.messages_sent / monthlyLimit) * 100;
      if (usagePercentage >= 90) {
        console.log(`⚠️ User ${userId} is approaching monthly limit: ${usagePercentage.toFixed(1)}%`);
        
        // Add warning header but allow the request to proceed
        res.set('X-Usage-Warning', JSON.stringify({
          percentage: Math.round(usagePercentage),
          remaining: monthlyLimit - currentUsage.messages_sent,
          limit: monthlyLimit
        }));
      }

      // 5. Store usage info in request for later tracking
      req.usageInfo = {
        userId,
        provider,
        currentMonth,
        currentUsage: currentUsage.messages_sent,
        monthlyLimit,
        remaining: monthlyLimit - currentUsage.messages_sent
      };

      next();
    } catch (error: any) {
      console.error('❌ Usage enforcement error:', error);
      return res.status(500).json({ 
        error: 'Failed to check usage limits',
        message: 'Unable to verify usage limits. Please try again.'
      });
    }
  };
}

/**
 * Middleware to track usage after successful message sending
 */
export function trackUsage() {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Store original res.json to intercept the response
    const originalJson = res.json;
    
    res.json = function(body: any) {
      // If the response indicates success and we have usage info, track the usage
      if (req.usageInfo && (res.statusCode === 200 || res.statusCode === 201)) {
        trackMessageSent(req.usageInfo.userId, req.usageInfo.provider, req.usageInfo.currentMonth)
          .catch(error => {
            console.error('❌ Failed to track usage:', error);
            // Don't fail the request if usage tracking fails
          });
      }
      
      // Call the original json method
      return originalJson.call(this, body);
    };
    
    next();
  };
}

/**
 * Track a sent message in the usage statistics
 */
async function trackMessageSent(userId: string, provider: string, periodYm: string): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO channels_usage (user_id, provider, period_ym, messages_sent)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (user_id, provider, period_ym)
       DO UPDATE SET 
         messages_sent = channels_usage.messages_sent + 1,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, provider, periodYm]
    );
    
    console.log(`✅ Tracked message sent for user ${userId}, provider ${provider}`);
  } catch (error) {
    console.error('❌ Error tracking message sent:', error);
    throw error;
  }
}

/**
 * Track a received message in the usage statistics
 */
export async function trackMessageReceived(userId: string, provider: string, periodYm?: string): Promise<void> {
  try {
    const now = new Date();
    const currentMonth = periodYm || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    await pool.query(
      `INSERT INTO channels_usage (user_id, provider, period_ym, messages_rcvd)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (user_id, provider, period_ym)
       DO UPDATE SET 
         messages_rcvd = channels_usage.messages_rcvd + 1,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, provider, currentMonth]
    );
    
    console.log(`✅ Tracked message received for user ${userId}, provider ${provider}`);
  } catch (error) {
    console.error('❌ Error tracking message received:', error);
    throw error;
  }
}

/**
 * Get the next month reset date for usage limits
 */
function getNextMonthResetDate(currentDate: Date): string {
  const nextMonth = new Date(currentDate);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(1);
  nextMonth.setHours(0, 0, 0, 0);
  return nextMonth.toISOString();
}

/**
 * Get current usage for a user and provider
 */
export async function getCurrentUsage(userId: string, provider: string, month?: string): Promise<{
  sent: number;
  received: number;
  limit: number;
  remaining: number;
  percentage: number;
}> {
  const now = new Date();
  const currentMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthlyLimit = MONTHLY_LIMITS[provider as keyof typeof MONTHLY_LIMITS];

  const usageResult = await pool.query(
    `SELECT messages_sent, messages_rcvd 
     FROM channels_usage 
     WHERE user_id = $1 AND provider = $2 AND period_ym = $3`,
    [userId, provider, currentMonth]
  );

  const usage = usageResult.rows[0] || { messages_sent: 0, messages_rcvd: 0 };
  const remaining = Math.max(0, monthlyLimit - usage.messages_sent);
  const percentage = (usage.messages_sent / monthlyLimit) * 100;

  return {
    sent: usage.messages_sent,
    received: usage.messages_rcvd,
    limit: monthlyLimit,
    remaining,
    percentage: Math.round(percentage * 100) / 100
  };
}

// Extend the AuthRequest interface to include usage info
declare global {
  namespace Express {
    interface Request {
      usageInfo?: {
        userId: string;
        provider: string;
        currentMonth: string;
        currentUsage: number;
        monthlyLimit: number;
        remaining: number;
      };
    }
  }
}
