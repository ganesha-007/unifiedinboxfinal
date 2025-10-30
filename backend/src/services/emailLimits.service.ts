// Email Rate Limiting Service
import { Pool } from 'pg';
import { incrWithTtl, getNumber, getString, setString, setIfAllowed } from './kv';
import { trackEvent } from './analytics.service';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'whatsapp_integration',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// Rate limiting configuration
const EMAIL_LIMITS = {
  MAX_RECIPIENTS_PER_MESSAGE: parseInt(process.env.EMAIL_MAX_RECIPIENTS_PER_MESSAGE || '10'),
  MAX_PER_HOUR: parseInt(process.env.EMAIL_MAX_PER_HOUR || '50'),
  MAX_PER_DAY: parseInt(process.env.EMAIL_MAX_PER_DAY || '200'),
  PER_RECIPIENT_COOLDOWN_SEC: parseInt(process.env.EMAIL_PER_RECIPIENT_COOLDOWN_SEC || '120'),
  PER_DOMAIN_COOLDOWN_SEC: parseInt(process.env.EMAIL_PER_DOMAIN_COOLDOWN_SEC || '60'),
  MAX_ATTACHMENT_BYTES: parseInt(process.env.EMAIL_MAX_ATTACHMENT_BYTES || '10485760'), // 10MB
  TRIAL_DAILY_CAP: parseInt(process.env.EMAIL_TRIAL_DAILY_CAP || '20'),
};

interface EnforceLimitsArgs {
  userId: string;
  mailboxId: string;
  to: string[];
  domains: string[];
  isReply: boolean;
  attachmentBytes: number;
  now?: Date;
}

export class EmailLimitsService {
  /**
   * Enforce email rate limits before sending
   */
  static async enforceLimits(args: EnforceLimitsArgs): Promise<void> {
    const {
      userId,
      mailboxId,
      to,
      domains,
      isReply,
      attachmentBytes,
      now = new Date()
    } = args;

    console.log(`📧 Enforcing email limits for user ${userId}, mailbox ${mailboxId}`);

    // Load workspace overrides if present
    try {
      const ws = await pool.query('SELECT * FROM workspace_settings WHERE user_id = $1', [userId]);
      const s = ws.rows[0];
      if (s) {
        EMAIL_LIMITS.MAX_RECIPIENTS_PER_MESSAGE = s.email_max_recipients_per_message ?? EMAIL_LIMITS.MAX_RECIPIENTS_PER_MESSAGE;
        EMAIL_LIMITS.MAX_PER_HOUR = s.email_max_per_hour ?? EMAIL_LIMITS.MAX_PER_HOUR;
        EMAIL_LIMITS.MAX_PER_DAY = s.email_max_per_day ?? EMAIL_LIMITS.MAX_PER_DAY;
        EMAIL_LIMITS.PER_RECIPIENT_COOLDOWN_SEC = s.email_per_recipient_cooldown_sec ?? EMAIL_LIMITS.PER_RECIPIENT_COOLDOWN_SEC;
        EMAIL_LIMITS.PER_DOMAIN_COOLDOWN_SEC = s.email_per_domain_cooldown_sec ?? EMAIL_LIMITS.PER_DOMAIN_COOLDOWN_SEC;
        EMAIL_LIMITS.MAX_ATTACHMENT_BYTES = s.email_max_attachment_bytes ?? EMAIL_LIMITS.MAX_ATTACHMENT_BYTES;
        if (typeof s.trial_mode === 'boolean' && s.trial_mode === true) {
          // Respect trial cap by using TRIAL_DAILY_CAP when aggregating per-day
        }
      }
    } catch (e) {
      // Ignore override errors; proceed with defaults
    }

    // 1. Basic guards
    if (to.length === 0) {
      throw this.createLimitError('NO_RECIPIENTS', 'No recipients specified.');
    }

    if (to.length > EMAIL_LIMITS.MAX_RECIPIENTS_PER_MESSAGE) {
      throw this.createLimitError(
        'RECIPIENT_CAP', 
        `Max ${EMAIL_LIMITS.MAX_RECIPIENTS_PER_MESSAGE} recipients per email.`
      );
    }

    if (attachmentBytes > EMAIL_LIMITS.MAX_ATTACHMENT_BYTES) {
      throw this.createLimitError(
        'ATTACHMENT_TOO_LARGE', 
        `Attachments exceed ${Math.round(EMAIL_LIMITS.MAX_ATTACHMENT_BYTES/1024/1024)} MB.`
      );
    }

    // 2. Check hourly and daily limits
    try { await this.checkHourlyLimit(mailboxId, now); } catch (e: any) { await this.logLimiterEvent(userId, mailboxId, e.code || 'HOURLY_CAP', e.message); throw e; }
    try { await this.checkDailyLimit(mailboxId, now); } catch (e: any) { await this.logLimiterEvent(userId, mailboxId, e.code || 'DAILY_CAP', e.message); throw e; }

    // 3. Check per-recipient cooldown (skip if reply)
    if (!isReply) {
      try { await this.checkRecipientCooldowns(mailboxId, to, now); } catch (e: any) { await this.logLimiterEvent(userId, mailboxId, e.code || 'RECIPIENT_COOLDOWN', e.message); throw e; }
    }

    // 4. Check domain pacing
    try { await this.checkDomainPacing(mailboxId, domains, now); } catch (e: any) { await this.logLimiterEvent(userId, mailboxId, e.code || 'DOMAIN_COOLDOWN', e.message); throw e; }

    console.log(`✅ Email limits passed for user ${userId}`);
  }

  /**
   * Check hourly email limit
   */
  private static async checkHourlyLimit(mailboxId: string, now: Date): Promise<void> {
    const hourKey = this.getHourKey(mailboxId, now);
    // Prefer Redis counter; fallback to DB helper
    let hourCount = 0;
    try {
      hourCount = await incrWithTtl(hourKey, 1, 70 * 60 * 1000);
    } catch {}
    if (!hourCount) {
      hourCount = await this.incrementCounter(hourKey, 1, 70 * 60 * 1000);
    }

    if (hourCount > EMAIL_LIMITS.MAX_PER_HOUR) {
      trackEvent('email_limit_block_send', { type: 'HOURLY_CAP', mailboxId });
      throw this.createLimitError(
        'HOURLY_CAP', 
        `Hourly send limit reached (${EMAIL_LIMITS.MAX_PER_HOUR}).`
      );
    }
  }

  /**
   * Check daily email limit
   */
  private static async checkDailyLimit(mailboxId: string, now: Date): Promise<void> {
    const dayKey = this.getDayKey(mailboxId, now);
    const isTrial = await this.isTrialMailbox(mailboxId);
    const dayCap = isTrial ? Math.min(EMAIL_LIMITS.MAX_PER_DAY, EMAIL_LIMITS.TRIAL_DAILY_CAP) : EMAIL_LIMITS.MAX_PER_DAY;
    let dayCount = 0;
    try {
      dayCount = await incrWithTtl(dayKey, 1, 26 * 60 * 60 * 1000);
    } catch {}
    if (!dayCount) {
      dayCount = await this.incrementCounter(dayKey, 1, 26 * 60 * 60 * 1000);
    }

    if (dayCount > dayCap) {
      trackEvent('email_limit_block_send', { type: 'DAILY_CAP', mailboxId });
      throw this.createLimitError(
        'DAILY_CAP', 
        `Daily send limit reached (${dayCap}).`
      );
    }
  }

  /**
   * Check per-recipient cooldown
   */
  private static async checkRecipientCooldowns(mailboxId: string, recipients: string[], now: Date): Promise<void> {
    for (const recipient of recipients) {
      const lastSentKey = this.getLastSentKey(mailboxId, recipient);
      let lastSent = await getString(lastSentKey);
      if (!lastSent) lastSent = await this.getLastSentTime(lastSentKey);
      
      if (lastSent) {
        const timeSinceLastSent = now.getTime() - new Date(lastSent).getTime();
        const cooldownMs = EMAIL_LIMITS.PER_RECIPIENT_COOLDOWN_SEC * 1000;
        
        if (timeSinceLastSent < cooldownMs) {
          trackEvent('email_recipient_cap_exceeded', { recipient, mailboxId });
          const remainingSec = Math.ceil((cooldownMs - timeSinceLastSent) / 1000);
          throw this.createLimitError(
            'RECIPIENT_COOLDOWN', 
            `Wait ${remainingSec}s before emailing ${recipient} again.`
          );
        }
      }
    }
  }

  /**
   * Check domain pacing
   */
  private static async checkDomainPacing(mailboxId: string, domains: string[], now: Date): Promise<void> {
    for (const domain of domains) {
      const lastDomainKey = this.getLastDomainKey(mailboxId, domain);
      let lastSent = await getString(lastDomainKey);
      if (!lastSent) lastSent = await this.getLastSentTime(lastDomainKey);
      
      if (lastSent) {
        const timeSinceLastSent = now.getTime() - new Date(lastSent).getTime();
        const cooldownMs = EMAIL_LIMITS.PER_DOMAIN_COOLDOWN_SEC * 1000;
        
        if (timeSinceLastSent < cooldownMs) {
          trackEvent('email_domain_cooldown_triggered', { domain, mailboxId });
          const remainingSec = Math.ceil((cooldownMs - timeSinceLastSent) / 1000);
          throw this.createLimitError(
            'DOMAIN_COOLDOWN', 
            `Slow down — pacing per domain (${domain}). Wait ${remainingSec}s.`
          );
        }
      }
    }
  }

  /**
   * Update cooldown timestamps after successful send
   */
  static async updateCooldowns(mailboxId: string, recipients: string[], domains: string[], now: Date = new Date()): Promise<void> {
    // Update recipient cooldowns
    for (const recipient of recipients) {
      const lastSentKey = this.getLastSentKey(mailboxId, recipient);
      await setString(lastSentKey, now.toISOString(), 7 * 24 * 60 * 60 * 1000);
      await this.setLastSentTime(lastSentKey, now.toISOString());
    }

    // Update domain cooldowns
    for (const domain of domains) {
      const lastDomainKey = this.getLastDomainKey(mailboxId, domain);
      await setString(lastDomainKey, now.toISOString(), 7 * 24 * 60 * 60 * 1000);
      await this.setLastSentTime(lastDomainKey, now.toISOString());
    }
  }

  /**
   * Get current usage statistics
   */
  static async getUsageStats(mailboxId: string, now: Date = new Date()): Promise<{
    perHour: number;
    usedHour: number;
    perDay: number;
    usedDay: number;
    cooldowns: {
      recipientSec: number;
      domainSec: number;
    };
  }> {
    const hourKey = this.getHourKey(mailboxId, now);
    const dayKey = this.getDayKey(mailboxId, now);
    
    const [usedHour, usedDay] = await Promise.all([
      this.getCounter(hourKey),
      this.getCounter(dayKey)
    ]);

    const isTrial = await this.isTrialMailbox(mailboxId);
    const dayCap = isTrial ? Math.min(EMAIL_LIMITS.MAX_PER_DAY, EMAIL_LIMITS.TRIAL_DAILY_CAP) : EMAIL_LIMITS.MAX_PER_DAY;

    return {
      perHour: EMAIL_LIMITS.MAX_PER_HOUR,
      usedHour,
      perDay: dayCap,
      usedDay,
      cooldowns: {
        recipientSec: EMAIL_LIMITS.PER_RECIPIENT_COOLDOWN_SEC,
        domainSec: EMAIL_LIMITS.PER_DOMAIN_COOLDOWN_SEC,
      }
    };
  }

  /**
   * Get aggregated usage statistics for all user's email accounts
   */
  static async getUserEmailLimits(userId: string, now: Date = new Date()): Promise<{
    perHour: number;
    usedHour: number;
    perDay: number;
    usedDay: number;
    cooldowns: {
      recipientSec: number;
      domainSec: number;
    };
    accounts: Array<{
      accountId: string;
      email: string;
      perHour: number;
      usedHour: number;
      perDay: number;
      usedDay: number;
    }>;
  }> {
    // Get all user's email accounts
    const accountsResult = await pool.query(
      `SELECT id, external_account_id, metadata 
       FROM channels_account 
       WHERE user_id = $1 AND provider = 'email' AND status = 'connected'`,
      [userId]
    );

    if (accountsResult.rows.length === 0) {
      return {
        perHour: EMAIL_LIMITS.MAX_PER_HOUR,
        usedHour: 0,
        perDay: EMAIL_LIMITS.MAX_PER_DAY,
        usedDay: 0,
        cooldowns: {
          recipientSec: EMAIL_LIMITS.PER_RECIPIENT_COOLDOWN_SEC,
          domainSec: EMAIL_LIMITS.PER_DOMAIN_COOLDOWN_SEC,
        },
        accounts: []
      };
    }

    // Get usage stats for each account
    const accountStats = await Promise.all(
      accountsResult.rows.map(async (account) => {
        const stats = await this.getUsageStats(account.id, now);
        const metadata = account.metadata || {};
        return {
          accountId: account.id,
          email: metadata.email || account.external_account_id,
          perHour: stats.perHour,
          usedHour: stats.usedHour,
          perDay: stats.perDay,
          usedDay: stats.usedDay,
        };
      })
    );

    // Aggregate the stats
    const totalUsedHour = accountStats.reduce((sum, account) => sum + account.usedHour, 0);
    const totalUsedDay = accountStats.reduce((sum, account) => sum + account.usedDay, 0);
    
    // For user-level limits, we use the maximum of individual account limits
    // This gives users the full benefit of having multiple accounts
    const maxPerHour = Math.max(...accountStats.map(account => account.perHour));
    const maxPerDay = Math.max(...accountStats.map(account => account.perDay));

    return {
      perHour: maxPerHour,
      usedHour: totalUsedHour,
      perDay: maxPerDay,
      usedDay: totalUsedDay,
      cooldowns: {
        recipientSec: EMAIL_LIMITS.PER_RECIPIENT_COOLDOWN_SEC,
        domainSec: EMAIL_LIMITS.PER_DOMAIN_COOLDOWN_SEC,
      },
      accounts: accountStats
    };
  }

  // Helper methods
  private static getHourKey(mailboxId: string, date: Date): string {
    const slot = `${date.getUTCFullYear()}${this.pad(date.getUTCMonth()+1)}${this.pad(date.getUTCDate())}${this.pad(date.getUTCHours())}`;
    return `email:hourly:${mailboxId}:${slot}`;
  }

  private static getDayKey(mailboxId: string, date: Date): string {
    const slot = `${date.getUTCFullYear()}${this.pad(date.getUTCMonth()+1)}${this.pad(date.getUTCDate())}`;
    return `email:daily:${mailboxId}:${slot}`;
  }

  private static getLastSentKey(mailboxId: string, recipient: string): string {
    return `email:last_to:${mailboxId}:${recipient.toLowerCase()}`;
  }

  private static getLastDomainKey(mailboxId: string, domain: string): string {
    return `email:last_domain:${mailboxId}:${domain.toLowerCase()}`;
  }

  private static pad(n: number): string {
    return n < 10 ? `0${n}` : `${n}`;
  }

  private static async incrementCounter(key: string, increment: number, ttlMs: number): Promise<number> {
    try {
      const result = await pool.query(`
        INSERT INTO email_usage_cache (key, count, expires_at) 
        VALUES ($1, $2, $3)
        ON CONFLICT (key) 
        DO UPDATE SET 
          count = email_usage_cache.count + $2,
          expires_at = $3
        RETURNING count
      `, [key, increment, new Date(Date.now() + ttlMs)]);
      
      return result.rows[0].count;
    } catch (error) {
      console.error('Error incrementing counter:', error);
      return 0;
    }
  }

  private static async getCounter(key: string): Promise<number> {
    try {
      const result = await pool.query(
        'SELECT count FROM email_usage_cache WHERE key = $1 AND expires_at > NOW()',
        [key]
      );
      return result.rows[0]?.count || 0;
    } catch (error) {
      console.error('Error getting counter:', error);
      return 0;
    }
  }

  private static async getLastSentTime(key: string): Promise<string | null> {
    try {
      const result = await pool.query(
        'SELECT value FROM email_usage_cache WHERE key = $1 AND expires_at > NOW()',
        [key]
      );
      return result.rows[0]?.value || null;
    } catch (error) {
      console.error('Error getting last sent time:', error);
      return null;
    }
  }

  private static async setLastSentTime(key: string, value: string): Promise<void> {
    try {
      await pool.query(`
        INSERT INTO email_usage_cache (key, value, expires_at) 
        VALUES ($1, $2, $3)
        ON CONFLICT (key) 
        DO UPDATE SET 
          value = $2,
          expires_at = $3
      `, [key, value, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]); // 7 days TTL
    } catch (error) {
      console.error('Error setting last sent time:', error);
    }
  }

  private static async isTrialMailbox(mailboxId: string): Promise<boolean> {
    try {
      const result = await pool.query(
        'SELECT is_trial FROM channels_account WHERE id = $1',
        [mailboxId]
      );
      return result.rows[0]?.is_trial || false;
    } catch (error) {
      console.error('Error checking trial status:', error);
      return false;
    }
  }

  private static createLimitError(code: string, message: string): Error {
    const error = new Error(message) as any;
    error.status = 402;
    error.code = code;
    return error;
  }

  private static async logLimiterEvent(userId: string, mailboxId: string, code: string, message: string) {
    try {
      await pool.query(
        `INSERT INTO limiter_events (user_id, mailbox_id, provider, code, message, created_at)
         VALUES ($1,$2,'email',$3,$4,CURRENT_TIMESTAMP)`,
        [userId, mailboxId, code, message]
      );
    } catch (e) {
      // swallow logging errors
    }
  }
}
