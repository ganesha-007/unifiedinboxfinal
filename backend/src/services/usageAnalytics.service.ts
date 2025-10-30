// Monthly Usage Analytics Service
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'whatsapp_integration',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// Monthly limits per provider
const MONTHLY_LIMITS = {
  whatsapp: parseInt(process.env.WHATSAPP_MONTHLY_LIMIT || '5000'),
  instagram: parseInt(process.env.INSTAGRAM_MONTHLY_LIMIT || '5000'),
  email: parseInt(process.env.EMAIL_MONTHLY_LIMIT || '10000'),
  outlook: parseInt(process.env.OUTLOOK_MONTHLY_LIMIT || '10000'),
};

export interface MonthlyUsage {
  period: string;
  provider: string;
  sent: number;
  received: number;
  limit: number;
  remaining: number;
  percentage: number;
}

export interface ProviderUsage {
  provider: string;
  totalSent: number;
  totalReceived: number;
  limit: number;
  remaining: number;
  percentage: number;
  accounts: Array<{
    accountId: string;
    accountName: string;
    sent: number;
    received: number;
  }>;
}

export interface UsageTrend {
  month: string;
  sent: number;
  received: number;
  total: number;
}

export interface UsageReport {
  userId: string;
  period: string;
  totalSent: number;
  totalReceived: number;
  totalLimit: number;
  totalRemaining: number;
  providers: ProviderUsage[];
  trends: UsageTrend[];
  summary: {
    mostUsedProvider: string;
    leastUsedProvider: string;
    averageDailyUsage: number;
    daysRemaining: number;
  };
}

export class UsageAnalyticsService {
  /**
   * Get monthly usage for a specific user and month
   */
  static async getMonthlyUsage(
    userId: string, 
    month?: string
  ): Promise<MonthlyUsage[]> {
    const now = new Date();
    const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    console.log(`📊 Getting monthly usage for user ${userId}, month ${targetMonth}`);

    const result = await pool.query(
      `SELECT provider, messages_sent, messages_rcvd 
       FROM channels_usage 
       WHERE user_id = $1 AND period_ym = $2
       ORDER BY provider`,
      [userId, targetMonth]
    );

    const usageData = result.rows.map(row => {
      const limit = MONTHLY_LIMITS[row.provider as keyof typeof MONTHLY_LIMITS] || 0;
      const remaining = Math.max(0, limit - row.messages_sent);
      const percentage = limit > 0 ? (row.messages_sent / limit) * 100 : 0;

      return {
        period: targetMonth,
        provider: row.provider,
        sent: row.messages_sent,
        received: row.messages_rcvd,
        limit,
        remaining,
        percentage: Math.round(percentage * 100) / 100
      };
    });

    // Ensure all providers are represented
    const allProviders = Object.keys(MONTHLY_LIMITS);
    const existingProviders = usageData.map(u => u.provider);
    
    allProviders.forEach(provider => {
      if (!existingProviders.includes(provider)) {
        const limit = MONTHLY_LIMITS[provider as keyof typeof MONTHLY_LIMITS];
        usageData.push({
          period: targetMonth,
          provider,
          sent: 0,
          received: 0,
          limit,
          remaining: limit,
          percentage: 0
        });
      }
    });

    return usageData.sort((a, b) => a.provider.localeCompare(b.provider));
  }

  /**
   * Get usage for a specific provider
   */
  static async getProviderUsage(
    userId: string, 
    provider: string, 
    months: number = 1
  ): Promise<ProviderUsage> {
    console.log(`📊 Getting ${provider} usage for user ${userId}, last ${months} months`);

    // Get usage data for the last N months
    const result = await pool.query(
      `SELECT period_ym, messages_sent, messages_rcvd 
       FROM channels_usage 
       WHERE user_id = $1 AND provider = $2
       ORDER BY period_ym DESC
       LIMIT $3`,
      [userId, provider, months]
    );

    // Aggregate the data
    const totalSent = result.rows.reduce((sum, row) => sum + row.messages_sent, 0);
    const totalReceived = result.rows.reduce((sum, row) => sum + row.messages_rcvd, 0);
    const limit = MONTHLY_LIMITS[provider as keyof typeof MONTHLY_LIMITS] || 0;
    const remaining = Math.max(0, limit - totalSent);
    const percentage = limit > 0 ? (totalSent / limit) * 100 : 0;

    // Get account-level breakdown
    const accountsResult = await pool.query(
      `SELECT ca.id, ca.external_account_id, ca.metadata,
              COALESCE(SUM(CASE WHEN cm.direction = 'out' THEN 1 ELSE 0 END), 0) as sent,
              COALESCE(SUM(CASE WHEN cm.direction = 'in' THEN 1 ELSE 0 END), 0) as received
       FROM channels_account ca
       LEFT JOIN channels_chat cc ON ca.id = cc.account_id
       LEFT JOIN channels_message cm ON cc.id = cm.chat_id
       WHERE ca.user_id = $1 AND ca.provider = $2
       GROUP BY ca.id, ca.external_account_id, ca.metadata`,
      [userId, provider]
    );

    const accounts = accountsResult.rows.map(row => ({
      accountId: row.id,
      accountName: row.metadata?.email || row.external_account_id || 'Unknown',
      sent: parseInt(row.sent) || 0,
      received: parseInt(row.received) || 0
    }));

    return {
      provider,
      totalSent,
      totalReceived,
      limit,
      remaining,
      percentage: Math.round(percentage * 100) / 100,
      accounts
    };
  }

  /**
   * Get usage trends over multiple months
   */
  static async getUsageTrends(
    userId: string, 
    months: number = 6
  ): Promise<UsageTrend[]> {
    console.log(`📊 Getting usage trends for user ${userId}, last ${months} months`);

    const result = await pool.query(
      `SELECT period_ym, 
              SUM(messages_sent) as total_sent,
              SUM(messages_rcvd) as total_received
       FROM channels_usage 
       WHERE user_id = $1
       GROUP BY period_ym
       ORDER BY period_ym DESC
       LIMIT $2`,
      [userId, months]
    );

    return result.rows.map(row => ({
      month: row.period_ym,
      sent: parseInt(row.total_sent) || 0,
      received: parseInt(row.total_received) || 0,
      total: (parseInt(row.total_sent) || 0) + (parseInt(row.total_received) || 0)
    })).reverse(); // Return in chronological order
  }

  /**
   * Generate comprehensive usage report
   */
  static async generateUsageReport(
    userId: string, 
    month?: string
  ): Promise<UsageReport> {
    const now = new Date();
    const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    console.log(`📊 Generating usage report for user ${userId}, month ${targetMonth}`);

    // Get monthly usage for all providers
    const monthlyUsage = await this.getMonthlyUsage(userId, targetMonth);
    
    // Get provider-specific usage
    const providers = await Promise.all(
      Object.keys(MONTHLY_LIMITS).map(provider => 
        this.getProviderUsage(userId, provider, 1)
      )
    );

    // Get trends for the last 6 months
    const trends = await this.getUsageTrends(userId, 6);

    // Calculate totals
    const totalSent = monthlyUsage.reduce((sum, usage) => sum + usage.sent, 0);
    const totalReceived = monthlyUsage.reduce((sum, usage) => sum + usage.received, 0);
    const totalLimit = monthlyUsage.reduce((sum, usage) => sum + usage.limit, 0);
    const totalRemaining = monthlyUsage.reduce((sum, usage) => sum + usage.remaining, 0);

    // Find most and least used providers
    const usedProviders = monthlyUsage.filter(u => u.sent > 0);
    const mostUsedProvider = usedProviders.length > 0 
      ? usedProviders.reduce((max, current) => current.sent > max.sent ? current : max).provider
      : 'none';
    const leastUsedProvider = usedProviders.length > 0
      ? usedProviders.reduce((min, current) => current.sent < min.sent ? current : min).provider
      : 'none';

    // Calculate average daily usage
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const averageDailyUsage = totalSent / daysInMonth;

    // Calculate days remaining in month
    const daysRemaining = Math.max(0, daysInMonth - now.getDate());

    return {
      userId,
      period: targetMonth,
      totalSent,
      totalReceived,
      totalLimit,
      totalRemaining,
      providers,
      trends,
      summary: {
        mostUsedProvider,
        leastUsedProvider,
        averageDailyUsage: Math.round(averageDailyUsage * 100) / 100,
        daysRemaining
      }
    };
  }

  /**
   * Get usage statistics for admin dashboard
   */
  static async getAdminUsageStats(months: number = 1): Promise<{
    totalUsers: number;
    totalMessages: number;
    topUsers: Array<{
      userId: string;
      totalSent: number;
      totalReceived: number;
    }>;
    providerStats: Array<{
      provider: string;
      totalSent: number;
      totalReceived: number;
      activeUsers: number;
    }>;
  }> {
    console.log(`📊 Getting admin usage stats for last ${months} months`);

    // Get total users
    const usersResult = await pool.query(
      `SELECT COUNT(DISTINCT user_id) as total_users FROM channels_usage`
    );
    const totalUsers = parseInt(usersResult.rows[0].total_users) || 0;

    // Get total messages
    const messagesResult = await pool.query(
      `SELECT SUM(messages_sent + messages_rcvd) as total_messages 
       FROM channels_usage 
       WHERE period_ym >= $1`,
      [`${new Date().getFullYear()}-${String(new Date().getMonth() - months + 2).padStart(2, '0')}`]
    );
    const totalMessages = parseInt(messagesResult.rows[0].total_messages) || 0;

    // Get top users
    const topUsersResult = await pool.query(
      `SELECT user_id, 
              SUM(messages_sent) as total_sent,
              SUM(messages_rcvd) as total_received
       FROM channels_usage 
       WHERE period_ym >= $1
       GROUP BY user_id
       ORDER BY (SUM(messages_sent) + SUM(messages_rcvd)) DESC
       LIMIT 10`,
      [`${new Date().getFullYear()}-${String(new Date().getMonth() - months + 2).padStart(2, '0')}`]
    );

    const topUsers = topUsersResult.rows.map(row => ({
      userId: row.user_id,
      totalSent: parseInt(row.total_sent) || 0,
      totalReceived: parseInt(row.total_received) || 0
    }));

    // Get provider statistics
    const providerStatsResult = await pool.query(
      `SELECT provider,
              SUM(messages_sent) as total_sent,
              SUM(messages_rcvd) as total_received,
              COUNT(DISTINCT user_id) as active_users
       FROM channels_usage 
       WHERE period_ym >= $1
       GROUP BY provider
       ORDER BY SUM(messages_sent + messages_rcvd) DESC`,
      [`${new Date().getFullYear()}-${String(new Date().getMonth() - months + 2).padStart(2, '0')}`]
    );

    const providerStats = providerStatsResult.rows.map(row => ({
      provider: row.provider,
      totalSent: parseInt(row.total_sent) || 0,
      totalReceived: parseInt(row.total_received) || 0,
      activeUsers: parseInt(row.active_users) || 0
    }));

    return {
      totalUsers,
      totalMessages,
      topUsers,
      providerStats
    };
  }

  /**
   * Clean up old usage data (for maintenance)
   */
  static async cleanupOldUsageData(monthsToKeep: number = 12): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsToKeep);
    const cutoffMonth = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}`;

    console.log(`🧹 Cleaning up usage data older than ${cutoffMonth}`);

    const result = await pool.query(
      `DELETE FROM channels_usage WHERE period_ym < $1`,
      [cutoffMonth]
    );

    console.log(`✅ Cleaned up ${result.rowCount} old usage records`);
  }
}
