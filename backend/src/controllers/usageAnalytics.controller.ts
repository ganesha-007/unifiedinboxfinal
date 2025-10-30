import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { UsageAnalyticsService } from '../services/usageAnalytics.service';
import { AnalyticsEventsService } from '../services/analyticsEvents.service';

/**
 * Get monthly usage for a user
 */
export async function getMonthlyUsage(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { month } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`📊 Getting monthly usage for user ${userId}`);

    const usage = await UsageAnalyticsService.getMonthlyUsage(userId, month as string);

    res.json({
      success: true,
      data: usage,
      summary: {
        totalSent: usage.reduce((sum, u) => sum + u.sent, 0),
        totalReceived: usage.reduce((sum, u) => sum + u.received, 0),
        totalLimit: usage.reduce((sum, u) => sum + u.limit, 0),
        totalRemaining: usage.reduce((sum, u) => sum + u.remaining, 0)
      }
    });

  } catch (error: any) {
    console.error('❌ Get monthly usage error:', error);
    res.status(500).json({ error: 'Failed to get monthly usage' });
  }
}

/**
 * Get usage for a specific provider
 */
export async function getProviderUsage(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { provider } = req.params;
    const { months = '1' } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`📊 Getting ${provider} usage for user ${userId}`);

    const usage = await UsageAnalyticsService.getProviderUsage(
      userId, 
      provider, 
      parseInt(months as string)
    );

    res.json({
      success: true,
      data: usage
    });

  } catch (error: any) {
    console.error('❌ Get provider usage error:', error);
    res.status(500).json({ error: 'Failed to get provider usage' });
  }
}

/**
 * Get usage trends over time
 */
export async function getUsageTrends(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { months = '6' } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`📊 Getting usage trends for user ${userId}`);

    const trends = await UsageAnalyticsService.getUsageTrends(
      userId, 
      parseInt(months as string)
    );

    res.json({
      success: true,
      data: trends
    });

  } catch (error: any) {
    console.error('❌ Get usage trends error:', error);
    res.status(500).json({ error: 'Failed to get usage trends' });
  }
}

/**
 * Generate comprehensive usage report
 */
export async function generateUsageReport(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { month } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`📊 Generating usage report for user ${userId}`);

    const report = await UsageAnalyticsService.generateUsageReport(
      userId, 
      month as string
    );

    res.json({
      success: true,
      data: report
    });

  } catch (error: any) {
    console.error('❌ Generate usage report error:', error);
    res.status(500).json({ error: 'Failed to generate usage report' });
  }
}

/**
 * Get current usage for all providers (for dashboard)
 */
export async function getCurrentUsage(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`📊 Getting current usage for user ${userId}`);

    const monthlyUsage = await UsageAnalyticsService.getMonthlyUsage(userId);
    const trends = await UsageAnalyticsService.getUsageTrends(userId, 3);

    // Calculate current month totals
    const currentMonth = monthlyUsage[0]?.period || '';
    const totalSent = monthlyUsage.reduce((sum, u) => sum + u.sent, 0);
    const totalReceived = monthlyUsage.reduce((sum, u) => sum + u.received, 0);
    const totalLimit = monthlyUsage.reduce((sum, u) => sum + u.limit, 0);
    const totalRemaining = monthlyUsage.reduce((sum, u) => sum + u.remaining, 0);

    // Find providers approaching limits
    const approachingLimits = monthlyUsage.filter(u => u.percentage >= 80 && u.percentage < 100);
    const exceededLimits = monthlyUsage.filter(u => u.percentage >= 100);

    res.json({
      success: true,
      data: {
        currentMonth,
        totals: {
          sent: totalSent,
          received: totalReceived,
          limit: totalLimit,
          remaining: totalRemaining,
          percentage: totalLimit > 0 ? Math.round((totalSent / totalLimit) * 100) : 0
        },
        providers: monthlyUsage,
        trends: trends.slice(-3), // Last 3 months
        alerts: {
          approachingLimits: approachingLimits.map(u => ({
            provider: u.provider,
            percentage: u.percentage,
            remaining: u.remaining
          })),
          exceededLimits: exceededLimits.map(u => ({
            provider: u.provider,
            percentage: u.percentage,
            overage: u.sent - u.limit
          }))
        }
      }
    });

  } catch (error: any) {
    console.error('❌ Get current usage error:', error);
    res.status(500).json({ error: 'Failed to get current usage' });
  }
}

/**
 * Admin endpoint to get usage statistics
 */
export async function getAdminUsageStats(req: AuthRequest, res: Response) {
  try {
    const { months = '1' } = req.query;

    // TODO: Add admin authentication check
    console.log(`📊 Getting admin usage stats for last ${months} months`);

    const stats = await UsageAnalyticsService.getAdminUsageStats(
      parseInt(months as string)
    );

    res.json({
      success: true,
      data: stats
    });

  } catch (error: any) {
    console.error('❌ Get admin usage stats error:', error);
    res.status(500).json({ error: 'Failed to get admin usage stats' });
  }
}

/**
 * Track a user event
 */
export async function trackEvent(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { eventType, eventCategory, properties = {} } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!eventType || !eventCategory) {
      return res.status(400).json({ error: 'eventType and eventCategory are required' });
    }

    await AnalyticsEventsService.trackEvent({
      userId,
      eventType,
      eventCategory,
      properties
    });

    res.json({ success: true });

  } catch (error: any) {
    console.error('❌ Track event error:', error);
    res.status(500).json({ error: 'Failed to track event' });
  }
}

/**
 * Get event analytics for user
 */
export async function getEventAnalytics(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { days = '30' } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const analytics = await AnalyticsEventsService.getEventAnalytics(
      userId,
      parseInt(days as string)
    );

    res.json({
      success: true,
      data: analytics
    });

  } catch (error: any) {
    console.error('❌ Get event analytics error:', error);
    res.status(500).json({ error: 'Failed to get event analytics' });
  }
}

/**
 * Get session analytics for user
 */
export async function getSessionAnalytics(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { days = '30' } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const analytics = await AnalyticsEventsService.getSessionAnalytics(
      userId,
      parseInt(days as string)
    );

    res.json({
      success: true,
      data: analytics
    });

  } catch (error: any) {
    console.error('❌ Get session analytics error:', error);
    res.status(500).json({ error: 'Failed to get session analytics' });
  }
}

/**
 * Get admin analytics (all users)
 */
export async function getAdminAnalytics(req: AuthRequest, res: Response) {
  try {
    const { days = '30' } = req.query;

    // TODO: Add admin authentication check
    console.log(`📊 Getting admin analytics for last ${days} days`);

    const analytics = await AnalyticsEventsService.getAdminAnalytics(
      parseInt(days as string)
    );

    res.json({
      success: true,
      data: analytics
    });

  } catch (error: any) {
    console.error('❌ Get admin analytics error:', error);
    res.status(500).json({ error: 'Failed to get admin analytics' });
  }
}
