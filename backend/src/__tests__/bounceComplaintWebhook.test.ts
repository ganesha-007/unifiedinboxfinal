import { handleBounceWebhook, handleComplaintWebhook } from '../controllers/bounceComplaint.controller';
import { pool } from '../config/database';
import {
  createMockRequest,
  createMockResponse,
  createQueryResult,
} from './helpers';

// Mock the database
jest.mock('../config/database', () => ({
  pool: {
    query: jest.fn(),
  },
}));

// Mock the bounce/complaint service
jest.mock('../services/bounceComplaint.service', () => ({
  BounceComplaintService: {
    recordBounce: jest.fn().mockResolvedValue(undefined),
    recordComplaint: jest.fn().mockResolvedValue(undefined),
  },
}));

import { BounceComplaintService } from '../services/bounceComplaint.service';

describe('Bounce/Complaint Webhook Handlers', () => {
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    mockReq = createMockRequest();
    mockRes = createMockResponse();
    jest.clearAllMocks();
  });

  describe('handleBounceWebhook', () => {
    it('should process structured bounce payload', async () => {
      mockReq.body = {
        user_id: 'user123',
        mailbox_id: 'mailbox123',
        email_address: 'test@example.com',
        bounce_type: 'hard',
        bounce_reason: '550 5.1.1 User does not exist',
        recipient_email: 'invalid@example.com',
      };

      await handleBounceWebhook(mockReq, mockRes);

      expect(BounceComplaintService.recordBounce).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Bounce recorded successfully',
      });
    });

    it('should parse ARF bounce report', async () => {
      mockReq.body = {
        raw_report: `Final-Recipient: rfc822;bounced@example.com
Status: 5.1.1
Action: failed
Diagnostic-Code: 550 5.1.1 User does not exist`,
      };

      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([{ user_id: 'user123' }]))
        .mockResolvedValueOnce(createQueryResult([{ external_account_id: 'mailbox123' }]));

      await handleBounceWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should handle missing user gracefully', async () => {
      mockReq.body = {
        raw_report: `Final-Recipient: rfc822;bounced@example.com`,
      };

      (pool.query as jest.Mock).mockResolvedValueOnce(createQueryResult([]));

      await handleBounceWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          warning: 'User not found for recipient email',
        })
      );
    });

    it('should handle invalid payload format', async () => {
      mockReq.body = {
        raw_report: 'invalid format',
      };

      (pool.query as jest.Mock).mockResolvedValueOnce(createQueryResult([]));

      await handleBounceWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid bounce report format',
        })
      );
    });

    it('should handle database errors', async () => {
      mockReq.body = {
        user_id: 'user123',
        mailbox_id: 'mailbox123',
        bounce_type: 'hard',
        recipient_email: 'test@example.com',
      };

      (BounceComplaintService.recordBounce as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      await handleBounceWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('handleComplaintWebhook', () => {
    it('should process structured complaint payload', async () => {
      mockReq.body = {
        user_id: 'user123',
        mailbox_id: 'mailbox123',
        email_address: 'test@example.com',
        complaint_type: 'spam',
        complaint_reason: 'User marked email as spam',
        recipient_email: 'complained@example.com',
      };

      await handleComplaintWebhook(mockReq, mockRes);

      expect(BounceComplaintService.recordComplaint).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Complaint recorded successfully',
      });
    });

    it('should parse ARF complaint report', async () => {
      mockReq.body = {
        raw_report: `Final-Recipient: rfc822;complained@example.com
Feedback-Type: abuse
User-Agent: SomeMailer/1.0`,
      };

      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([{ user_id: 'user123' }]))
        .mockResolvedValueOnce(createQueryResult([{ external_account_id: 'mailbox123' }]));

      await handleComplaintWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should handle missing user gracefully', async () => {
      mockReq.body = {
        raw_report: `Final-Recipient: rfc822;complained@example.com`,
      };

      (pool.query as jest.Mock).mockResolvedValueOnce(createQueryResult([]));

      await handleComplaintWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          warning: 'User not found for recipient email',
        })
      );
    });

    it('should handle invalid payload format', async () => {
      mockReq.body = {
        raw_report: 'invalid format',
      };

      (pool.query as jest.Mock).mockResolvedValueOnce(createQueryResult([]));

      await handleComplaintWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid complaint report format',
        })
      );
    });

    it('should handle database errors', async () => {
      mockReq.body = {
        user_id: 'user123',
        mailbox_id: 'mailbox123',
        recipient_email: 'test@example.com',
      };

      (BounceComplaintService.recordComplaint as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      await handleComplaintWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });
});

