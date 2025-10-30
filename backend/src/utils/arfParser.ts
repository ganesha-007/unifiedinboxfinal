/**
 * ARF (Abuse Reporting Format) Parser
 * Parses bounce and complaint reports in ARF format
 */

export interface ParsedBounceReport {
  bounceType: 'hard' | 'soft' | 'transient';
  recipientEmail: string;
  bounceReason?: string;
  bounceCode?: string;
  diagnosticCode?: string;
  originalMessageId?: string;
  originalRecipient?: string;
  reportingMTA?: string;
  arrivalDate?: string;
}

export interface ParsedComplaintReport {
  recipientEmail: string;
  complaintType?: string;
  complaintReason?: string;
  complaintFeedbackType?: string;
  originalMessageId?: string;
  originalRecipient?: string;
  userAgent?: string;
  complainedAt?: string;
}

/**
 * Parse ARF bounce report
 * ARF format typically contains:
 * - Content-Type: multipart/report; report-type=feedback-report
 * - Parts: human-readable, machine-readable, original message
 */
export function parseARFBounceReport(reportContent: string): ParsedBounceReport | null {
  try {
    const bounce: Partial<ParsedBounceReport> = {
      bounceType: 'soft', // Default to soft
      recipientEmail: ''
    };

    // Extract recipient email (common patterns)
    const recipientMatch = reportContent.match(/Original-Recipient:\s*rfc822;(.+)/i) ||
                          reportContent.match(/Final-Recipient:\s*rfc822;(.+)/i) ||
                          reportContent.match(/To:\s*([^\s<]+@[^\s>]+)/i);
    
    if (recipientMatch) {
      bounce.recipientEmail = recipientMatch[1].trim();
    }

    // Extract bounce reason
    const reasonMatch = reportContent.match(/Diagnostic-Code:\s*(.+)/i) ||
                       reportContent.match(/Status:\s*(.+)/i) ||
                       reportContent.match(/Action:\s*(.+)/i);
    
    if (reasonMatch) {
      bounce.diagnosticCode = reasonMatch[1].trim();
      bounce.bounceReason = reasonMatch[1].trim();
    }

    // Extract bounce type from action or status
    const actionMatch = reportContent.match(/Action:\s*(.+)/i);
    if (actionMatch) {
      const action = actionMatch[1].toLowerCase();
      if (action.includes('failed') || action.includes('delayed')) {
        bounce.bounceType = 'hard';
      } else if (action.includes('transient')) {
        bounce.bounceType = 'transient';
      }
    }

    // Extract status code
    const statusMatch = reportContent.match(/Status:\s*(\d+\.\d+\.\d+)/i);
    if (statusMatch) {
      bounce.bounceCode = statusMatch[1];
      // 5.x.x = hard bounce, 4.x.x = soft bounce
      if (statusMatch[1].startsWith('5')) {
        bounce.bounceType = 'hard';
      } else if (statusMatch[1].startsWith('4')) {
        bounce.bounceType = 'soft';
      }
    }

    // Extract message ID
    const messageIdMatch = reportContent.match(/Message-ID:\s*(.+)/i);
    if (messageIdMatch) {
      bounce.originalMessageId = messageIdMatch[1].trim();
    }

    // Extract original recipient
    const originalRecipientMatch = reportContent.match(/Original-Recipient:\s*rfc822;(.+)/i);
    if (originalRecipientMatch) {
      bounce.originalRecipient = originalRecipientMatch[1].trim();
    }

    if (!bounce.recipientEmail) {
      console.warn('⚠️ Could not extract recipient email from bounce report');
      return null;
    }

    return bounce as ParsedBounceReport;
  } catch (error) {
    console.error('❌ Error parsing ARF bounce report:', error);
    return null;
  }
}

/**
 * Parse ARF complaint report
 */
export function parseARFComplaintReport(reportContent: string): ParsedComplaintReport | null {
  try {
    const complaint: Partial<ParsedComplaintReport> = {
      complaintType: 'spam',
      recipientEmail: ''
    };

    // Extract recipient email
    const recipientMatch = reportContent.match(/Original-Recipient:\s*rfc822;(.+)/i) ||
                          reportContent.match(/Final-Recipient:\s*rfc822;(.+)/i) ||
                          reportContent.match(/To:\s*([^\s<]+@[^\s>]+)/i);
    
    if (recipientMatch) {
      complaint.recipientEmail = recipientMatch[1].trim();
    }

    // Extract feedback type
    const feedbackMatch = reportContent.match(/Feedback-Type:\s*(.+)/i);
    if (feedbackMatch) {
      complaint.complaintFeedbackType = feedbackMatch[1].trim();
    }

    // Extract complaint reason
    const reasonMatch = reportContent.match(/User-Agent:\s*(.+)/i) ||
                       reportContent.match(/Reported-Domain:\s*(.+)/i);
    
    if (reasonMatch) {
      complaint.complaintReason = reasonMatch[1].trim();
    }

    // Extract message ID
    const messageIdMatch = reportContent.match(/Message-ID:\s*(.+)/i);
    if (messageIdMatch) {
      complaint.originalMessageId = messageIdMatch[1].trim();
    }

    // Extract original recipient
    const originalRecipientMatch = reportContent.match(/Original-Recipient:\s*rfc822;(.+)/i);
    if (originalRecipientMatch) {
      complaint.originalRecipient = originalRecipientMatch[1].trim();
    }

    if (!complaint.recipientEmail) {
      console.warn('⚠️ Could not extract recipient email from complaint report');
      return null;
    }

    return complaint as ParsedComplaintReport;
  } catch (error) {
    console.error('❌ Error parsing ARF complaint report:', error);
    return null;
  }
}

/**
 * Parse simple bounce notification (non-ARF format)
 */
export function parseSimpleBounce(emailBody: string, headers: Record<string, string>): ParsedBounceReport | null {
  try {
    const bounce: Partial<ParsedBounceReport> = {
      bounceType: 'soft',
      recipientEmail: headers['to'] || headers['recipient'] || ''
    };

    // Try to extract from body
    const emailMatch = emailBody.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch && !bounce.recipientEmail) {
      bounce.recipientEmail = emailMatch[1];
    }

    // Extract bounce reason from body
    const reasonKeywords = ['bounced', 'undeliverable', 'rejected', 'failed', 'invalid', 'does not exist'];
    for (const keyword of reasonKeywords) {
      if (emailBody.toLowerCase().includes(keyword)) {
        bounce.bounceReason = emailBody.substring(0, 200); // First 200 chars
        break;
      }
    }

    // Determine bounce type from keywords
    const hardKeywords = ['invalid', 'does not exist', 'no such user', 'permanent failure'];
    const softKeywords = ['temporarily', 'queue', 'delayed', 'try again'];
    
    const bodyLower = emailBody.toLowerCase();
    if (hardKeywords.some(k => bodyLower.includes(k))) {
      bounce.bounceType = 'hard';
    } else if (softKeywords.some(k => bodyLower.includes(k))) {
      bounce.bounceType = 'soft';
    }

    if (!bounce.recipientEmail) {
      return null;
    }

    return bounce as ParsedBounceReport;
  } catch (error) {
    console.error('❌ Error parsing simple bounce:', error);
    return null;
  }
}

/**
 * Parse simple complaint notification
 */
export function parseSimpleComplaint(emailBody: string, headers: Record<string, string>): ParsedComplaintReport | null {
  try {
    const complaint: Partial<ParsedComplaintReport> = {
      complaintType: 'spam',
      recipientEmail: headers['to'] || headers['recipient'] || ''
    };

    // Try to extract from body
    const emailMatch = emailBody.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch && !complaint.recipientEmail) {
      complaint.recipientEmail = emailMatch[1];
    }

    // Extract complaint reason
    if (emailBody.toLowerCase().includes('spam') || emailBody.toLowerCase().includes('complaint')) {
      complaint.complaintReason = emailBody.substring(0, 200);
    }

    if (!complaint.recipientEmail) {
      return null;
    }

    return complaint as ParsedComplaintReport;
  } catch (error) {
    console.error('❌ Error parsing simple complaint:', error);
    return null;
  }
}

