import { Request, Response } from 'express';
import { BounceComplaintService, BounceEvent, ComplaintEvent } from '../services/bounceComplaint.service';
import { 
  parseARFBounceReport, 
  parseARFComplaintReport,
  parseSimpleBounce,
  parseSimpleComplaint
} from '../utils/arfParser';
import { pool } from '../config/database';

/**
 * Handle bounce webhook
 * Supports both ARF format and simple bounce notifications
 */
export async function handleBounceWebhook(req: Request, res: Response) {
  try {
    console.log('📧 Bounce webhook received');
    console.log('📧 Headers:', JSON.stringify(req.headers, null, 2));
    console.log('📧 Body:', JSON.stringify(req.body, null, 2));

    const { user_id, mailbox_id, email_address } = req.body;
    
    // If structured data is provided directly
    if (user_id && mailbox_id && req.body.bounce_type && req.body.recipient_email) {
      const bounceEvent: BounceEvent = {
        user_id,
        mailbox_id,
        email_address: email_address || req.body.recipient_email,
        bounce_type: req.body.bounce_type,
        bounce_reason: req.body.bounce_reason,
        bounce_code: req.body.bounce_code,
        bounce_category: req.body.bounce_category,
        diagnostic_code: req.body.diagnostic_code,
        original_message_id: req.body.original_message_id,
        recipient_email: req.body.recipient_email
      };

      await BounceComplaintService.recordBounce(bounceEvent);
      
      return res.status(200).json({ 
        success: true, 
        message: 'Bounce recorded successfully' 
      });
    }

    // Try to parse ARF format
    const reportContent = typeof req.body === 'string' 
      ? req.body 
      : JSON.stringify(req.body);

    let parsedBounce = parseARFBounceReport(reportContent);

    // If ARF parsing failed, try simple format
    if (!parsedBounce) {
      const headers = req.headers as Record<string, string>;
      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      parsedBounce = parseSimpleBounce(body, headers);
    }

    if (!parsedBounce || !parsedBounce.recipientEmail) {
      console.warn('⚠️ Could not parse bounce report - missing required fields');
      return res.status(400).json({ 
        error: 'Invalid bounce report format',
        message: 'Could not extract recipient email or bounce type'
      });
    }

    // Try to find user_id and mailbox_id from recipient email
    // This is a fallback - ideally webhooks should include user_id
    const userResult = await pool.query(
      `SELECT user_id FROM user_credentials WHERE gmail_email = $1 OR outlook_email = $1 LIMIT 1`,
      [parsedBounce.recipientEmail]
    );

    if (userResult.rows.length === 0) {
      console.warn(`⚠️ No user found for bounce recipient: ${parsedBounce.recipientEmail}`);
      return res.status(200).json({ 
        success: true, 
        message: 'Bounce received but no user found',
        warning: 'User not found for recipient email'
      });
    }

    const foundUserId = userResult.rows[0].user_id;

    // Get mailbox_id from account
    const accountResult = await pool.query(
      `SELECT id, external_account_id FROM channels_account 
       WHERE user_id = $1 AND provider = 'email' LIMIT 1`,
      [foundUserId]
    );

    const mailboxId = accountResult.rows.length > 0 
      ? accountResult.rows[0].external_account_id 
      : 'unknown';

    const bounceEvent: BounceEvent = {
      user_id: foundUserId,
      mailbox_id: mailboxId,
      email_address: email_address || parsedBounce.recipientEmail,
      bounce_type: parsedBounce.bounceType,
      bounce_reason: parsedBounce.bounceReason,
      bounce_code: parsedBounce.bounceCode,
      diagnostic_code: parsedBounce.diagnosticCode,
      original_message_id: parsedBounce.originalMessageId,
      recipient_email: parsedBounce.recipientEmail
    };

    await BounceComplaintService.recordBounce(bounceEvent);

    console.log(`✅ Bounce recorded: ${parsedBounce.bounceType} bounce for ${parsedBounce.recipientEmail}`);

    res.status(200).json({ 
      success: true, 
      message: 'Bounce recorded successfully',
      bounce_type: parsedBounce.bounceType
    });
  } catch (error: any) {
    console.error('❌ Bounce webhook error:', error);
    res.status(500).json({ 
      error: 'Failed to process bounce webhook',
      message: error.message 
    });
  }
}

/**
 * Handle complaint webhook
 * Supports both ARF format and simple complaint notifications
 */
export async function handleComplaintWebhook(req: Request, res: Response) {
  try {
    console.log('🚨 Complaint webhook received');
    console.log('🚨 Headers:', JSON.stringify(req.headers, null, 2));
    console.log('🚨 Body:', JSON.stringify(req.body, null, 2));

    const { user_id, mailbox_id, email_address } = req.body;
    
    // If structured data is provided directly
    if (user_id && mailbox_id && req.body.recipient_email) {
      const complaintEvent: ComplaintEvent = {
        user_id,
        mailbox_id,
        email_address: email_address || req.body.recipient_email,
        complaint_type: req.body.complaint_type,
        complaint_reason: req.body.complaint_reason,
        complaint_feedback_type: req.body.complaint_feedback_type,
        original_message_id: req.body.original_message_id,
        recipient_email: req.body.recipient_email
      };

      await BounceComplaintService.recordComplaint(complaintEvent);
      
      return res.status(200).json({ 
        success: true, 
        message: 'Complaint recorded successfully' 
      });
    }

    // Try to parse ARF format
    const reportContent = typeof req.body === 'string' 
      ? req.body 
      : JSON.stringify(req.body);

    let parsedComplaint = parseARFComplaintReport(reportContent);

    // If ARF parsing failed, try simple format
    if (!parsedComplaint) {
      const headers = req.headers as Record<string, string>;
      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      parsedComplaint = parseSimpleComplaint(body, headers);
    }

    if (!parsedComplaint || !parsedComplaint.recipientEmail) {
      console.warn('⚠️ Could not parse complaint report - missing required fields');
      return res.status(400).json({ 
        error: 'Invalid complaint report format',
        message: 'Could not extract recipient email'
      });
    }

    // Try to find user_id and mailbox_id from recipient email
    const userResult = await pool.query(
      `SELECT user_id FROM user_credentials WHERE gmail_email = $1 OR outlook_email = $1 LIMIT 1`,
      [parsedComplaint.recipientEmail]
    );

    if (userResult.rows.length === 0) {
      console.warn(`⚠️ No user found for complaint recipient: ${parsedComplaint.recipientEmail}`);
      return res.status(200).json({ 
        success: true, 
        message: 'Complaint received but no user found',
        warning: 'User not found for recipient email'
      });
    }

    const foundUserId = userResult.rows[0].user_id;

    // Get mailbox_id from account
    const accountResult = await pool.query(
      `SELECT id, external_account_id FROM channels_account 
       WHERE user_id = $1 AND provider = 'email' LIMIT 1`,
      [foundUserId]
    );

    const mailboxId = accountResult.rows.length > 0 
      ? accountResult.rows[0].external_account_id 
      : 'unknown';

    const complaintEvent: ComplaintEvent = {
      user_id: foundUserId,
      mailbox_id: mailboxId,
      email_address: email_address || parsedComplaint.recipientEmail,
      complaint_type: parsedComplaint.complaintType,
      complaint_reason: parsedComplaint.complaintReason,
      complaint_feedback_type: parsedComplaint.complaintFeedbackType,
      original_message_id: parsedComplaint.originalMessageId,
      recipient_email: parsedComplaint.recipientEmail
    };

    await BounceComplaintService.recordComplaint(complaintEvent);

    console.log(`✅ Complaint recorded for ${parsedComplaint.recipientEmail}`);

    res.status(200).json({ 
      success: true, 
      message: 'Complaint recorded successfully'
    });
  } catch (error: any) {
    console.error('❌ Complaint webhook error:', error);
    res.status(500).json({ 
      error: 'Failed to process complaint webhook',
      message: error.message 
    });
  }
}

/**
 * Get bounce statistics for authenticated user
 */
export async function getBounceStats(req: any, res: Response) {
  try {
    const userId = req.user?.id;
    const mailboxId = req.query.mailbox_id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const stats = await BounceComplaintService.getBounceStats(userId, mailboxId);

    res.json(stats);
  } catch (error: any) {
    console.error('❌ Get bounce stats error:', error);
    res.status(500).json({ error: 'Failed to get bounce statistics' });
  }
}

/**
 * Get complaint statistics for authenticated user
 */
export async function getComplaintStats(req: any, res: Response) {
  try {
    const userId = req.user?.id;
    const mailboxId = req.query.mailbox_id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const stats = await BounceComplaintService.getComplaintStats(userId, mailboxId);

    res.json(stats);
  } catch (error: any) {
    console.error('❌ Get complaint stats error:', error);
    res.status(500).json({ error: 'Failed to get complaint statistics' });
  }
}

/**
 * Get reputation for authenticated user
 */
export async function getReputation(req: any, res: Response) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const reputation = await BounceComplaintService.getReputation(userId);

    res.json(reputation);
  } catch (error: any) {
    console.error('❌ Get reputation error:', error);
    res.status(500).json({ error: 'Failed to get reputation' });
  }
}

