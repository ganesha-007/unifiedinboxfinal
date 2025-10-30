import { Pool } from 'pg';
import { pool } from '../config/database';

/**
 * Email Bounce and Complaint Handling Service
 * Processes email bounces and spam complaints for deliverability monitoring
 */

export interface BounceEvent {
  user_id: string;
  mailbox_id: string;
  email_address: string;
  bounce_type: 'hard' | 'soft' | 'transient';
  bounce_reason?: string;
  bounce_code?: string;
  bounce_category?: string;
  diagnostic_code?: string;
  original_message_id?: string;
  recipient_email: string;
}

export interface ComplaintEvent {
  user_id: string;
  mailbox_id: string;
  email_address: string;
  complaint_type?: string;
  complaint_reason?: string;
  complaint_feedback_type?: string;
  original_message_id?: string;
  recipient_email: string;
}

export class BounceComplaintService {
  /**
   * Record a bounce event
   */
  static async recordBounce(bounce: BounceEvent): Promise<void> {
    try {
      console.log(`📧 Recording bounce: ${bounce.bounce_type} bounce for ${bounce.recipient_email}`);
      
      await pool.query(
        `INSERT INTO email_bounces (
          user_id, mailbox_id, email_address, bounce_type, bounce_reason,
          bounce_code, bounce_category, diagnostic_code, original_message_id, recipient_email
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          bounce.user_id,
          bounce.mailbox_id,
          bounce.email_address,
          bounce.bounce_type,
          bounce.bounce_reason || null,
          bounce.bounce_code || null,
          bounce.bounce_category || null,
          bounce.diagnostic_code || null,
          bounce.original_message_id || null,
          bounce.recipient_email
        ]
      );

      // Update reputation metrics
      await this.updateReputation(bounce.user_id, bounce.mailbox_id);

      console.log(`✅ Bounce recorded successfully`);
    } catch (error) {
      console.error('❌ Error recording bounce:', error);
      throw error;
    }
  }

  /**
   * Record a complaint event
   */
  static async recordComplaint(complaint: ComplaintEvent): Promise<void> {
    try {
      console.log(`🚨 Recording complaint for ${complaint.recipient_email}`);
      
      await pool.query(
        `INSERT INTO email_complaints (
          user_id, mailbox_id, email_address, complaint_type, complaint_reason,
          complaint_feedback_type, original_message_id, recipient_email
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          complaint.user_id,
          complaint.mailbox_id,
          complaint.email_address,
          complaint.complaint_type || null,
          complaint.complaint_reason || null,
          complaint.complaint_feedback_type || null,
          complaint.original_message_id || null,
          complaint.recipient_email
        ]
      );

      // Update reputation metrics
      await this.updateReputation(complaint.user_id, complaint.mailbox_id);

      console.log(`✅ Complaint recorded successfully`);
    } catch (error) {
      console.error('❌ Error recording complaint:', error);
      throw error;
    }
  }

  /**
   * Update reputation metrics for a user/mailbox
   */
  static async updateReputation(userId: string, mailboxId: string): Promise<void> {
    try {
      // Get bounce statistics
      const bounceStats = await pool.query(
        `SELECT 
          COUNT(*) as total_bounces,
          COUNT(*) FILTER (WHERE bounce_type = 'hard') as hard_bounces,
          COUNT(*) FILTER (WHERE bounce_type = 'soft') as soft_bounces
        FROM email_bounces
        WHERE user_id = $1 AND mailbox_id = $2`,
        [userId, mailboxId]
      );

      // Get complaint statistics
      const complaintStats = await pool.query(
        `SELECT COUNT(*) as total_complaints
        FROM email_complaints
        WHERE user_id = $1 AND mailbox_id = $2`,
        [userId, mailboxId]
      );

      // Get total sent count (from usage tracking)
      const usageStats = await pool.query(
        `SELECT COALESCE(SUM(message_count), 0) as total_sent
        FROM channels_monthly_usage
        WHERE user_id = $1 AND provider = 'email'`,
        [userId]
      );

      const totalBounces = parseInt(bounceStats.rows[0].total_bounces || '0');
      const hardBounces = parseInt(bounceStats.rows[0].hard_bounces || '0');
      const softBounces = parseInt(bounceStats.rows[0].soft_bounces || '0');
      const totalComplaints = parseInt(complaintStats.rows[0].total_complaints || '0');
      const totalSent = parseInt(usageStats.rows[0].total_sent || '0');

      // Calculate rates
      const bounceRate = totalSent > 0 ? (totalBounces / totalSent) * 100 : 0;
      const complaintRate = totalSent > 0 ? (totalComplaints / totalSent) * 100 : 0;

      // Calculate reputation score (0-100)
      // Lower is better: 100 = perfect, decreases with bounces/complaints
      let reputationScore = 100;
      reputationScore -= Math.min(hardBounces * 10, 50); // Hard bounces heavily penalize
      reputationScore -= Math.min(softBounces * 2, 20); // Soft bounces moderate penalty
      reputationScore -= Math.min(totalComplaints * 15, 40); // Complaints heavily penalize
      reputationScore = Math.max(0, Math.min(100, reputationScore));

      // Upsert reputation record
      await pool.query(
        `INSERT INTO email_reputation (
          user_id, mailbox_id, bounce_rate, complaint_rate,
          hard_bounce_count, soft_bounce_count, complaint_count,
          total_sent, reputation_score
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (user_id) DO UPDATE SET
          mailbox_id = EXCLUDED.mailbox_id,
          bounce_rate = EXCLUDED.bounce_rate,
          complaint_rate = EXCLUDED.complaint_rate,
          hard_bounce_count = EXCLUDED.hard_bounce_count,
          soft_bounce_count = EXCLUDED.soft_bounce_count,
          complaint_count = EXCLUDED.complaint_count,
          total_sent = EXCLUDED.total_sent,
          reputation_score = EXCLUDED.reputation_score,
          last_updated = CURRENT_TIMESTAMP`,
        [
          userId,
          mailboxId,
          bounceRate,
          complaintRate,
          hardBounces,
          softBounces,
          totalComplaints,
          totalSent,
          reputationScore
        ]
      );

      console.log(`📊 Reputation updated: Score=${reputationScore}, Bounce Rate=${bounceRate.toFixed(2)}%, Complaint Rate=${complaintRate.toFixed(2)}%`);
    } catch (error) {
      console.error('❌ Error updating reputation:', error);
      // Don't throw - reputation update failure shouldn't break bounce/complaint recording
    }
  }

  /**
   * Get bounce statistics for a user
   */
  static async getBounceStats(userId: string, mailboxId?: string): Promise<any> {
    try {
      const query = mailboxId
        ? `SELECT * FROM email_bounces WHERE user_id = $1 AND mailbox_id = $2 ORDER BY bounced_at DESC`
        : `SELECT * FROM email_bounces WHERE user_id = $1 ORDER BY bounced_at DESC`;
      
      const params = mailboxId ? [userId, mailboxId] : [userId];
      
      const result = await pool.query(query, params);
      
      return {
        total: result.rows.length,
        hard: result.rows.filter((r: any) => r.bounce_type === 'hard').length,
        soft: result.rows.filter((r: any) => r.bounce_type === 'soft').length,
        transient: result.rows.filter((r: any) => r.bounce_type === 'transient').length,
        bounces: result.rows
      };
    } catch (error) {
      console.error('❌ Error getting bounce stats:', error);
      throw error;
    }
  }

  /**
   * Get complaint statistics for a user
   */
  static async getComplaintStats(userId: string, mailboxId?: string): Promise<any> {
    try {
      const query = mailboxId
        ? `SELECT * FROM email_complaints WHERE user_id = $1 AND mailbox_id = $2 ORDER BY complained_at DESC`
        : `SELECT * FROM email_complaints WHERE user_id = $1 ORDER BY complained_at DESC`;
      
      const params = mailboxId ? [userId, mailboxId] : [userId];
      
      const result = await pool.query(query, params);
      
      return {
        total: result.rows.length,
        complaints: result.rows
      };
    } catch (error) {
      console.error('❌ Error getting complaint stats:', error);
      throw error;
    }
  }

  /**
   * Get reputation for a user
   */
  static async getReputation(userId: string): Promise<any> {
    try {
      const result = await pool.query(
        `SELECT * FROM email_reputation WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return {
          user_id: userId,
          reputation_score: 100,
          bounce_rate: 0,
          complaint_rate: 0,
          hard_bounce_count: 0,
          soft_bounce_count: 0,
          complaint_count: 0,
          total_sent: 0
        };
      }

      return result.rows[0];
    } catch (error) {
      console.error('❌ Error getting reputation:', error);
      throw error;
    }
  }

  /**
   * Check if email address should be blocked due to bounces/complaints
   */
  static async shouldBlockEmail(userId: string, emailAddress: string): Promise<{ blocked: boolean; reason?: string }> {
    try {
      // Check for hard bounces (3+ hard bounces = block)
      const hardBounceCount = await pool.query(
        `SELECT COUNT(*) as count FROM email_bounces
        WHERE user_id = $1 AND recipient_email = $2 AND bounce_type = 'hard'`,
        [userId, emailAddress]
      );

      if (parseInt(hardBounceCount.rows[0].count) >= 3) {
        return {
          blocked: true,
          reason: 'Too many hard bounces for this email address'
        };
      }

      // Check for complaints (1+ complaint = block)
      const complaintCount = await pool.query(
        `SELECT COUNT(*) as count FROM email_complaints
        WHERE user_id = $1 AND recipient_email = $2`,
        [userId, emailAddress]
      );

      if (parseInt(complaintCount.rows[0].count) >= 1) {
        return {
          blocked: true,
          reason: 'Email address has complaints - automatically blocked'
        };
      }

      return { blocked: false };
    } catch (error) {
      console.error('❌ Error checking email block status:', error);
      // Don't block on error - fail open
      return { blocked: false };
    }
  }
}

