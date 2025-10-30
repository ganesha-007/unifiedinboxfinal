import { handleGmailWebhook, setupGmailWatch } from '../controllers/gmail-webhook.controller';
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

// Mock googleapis
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
      })),
    },
    gmail: jest.fn(),
  },
}));

// Mock PubSub
jest.mock('@google-cloud/pubsub', () => ({
  PubSub: jest.fn().mockImplementation(() => ({
    topic: jest.fn().mockReturnValue({
      publishMessage: jest.fn().mockResolvedValue(['message-id']),
    }),
  })),
}));

describe('Gmail Webhook Handlers', () => {
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    mockReq = createMockRequest();
    mockRes = createMockResponse();
    jest.clearAllMocks();
  });

  describe('handleGmailWebhook', () => {
    it('should handle Pub/Sub message', async () => {
      const notificationData = {
        emailAddress: 'test@example.com',
        historyId: '12345',
      };

      mockReq.body = {
        message: {
          data: Buffer.from(JSON.stringify(notificationData)).toString('base64'),
          messageId: 'msg123',
          publishTime: new Date().toISOString(),
        },
      };

      // Mock database queries
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([{ user_id: 'user123' }])) // User found
        .mockResolvedValueOnce(createQueryResult([{
          gmail_access_token: 'token123',
          gmail_refresh_token: 'refresh123',
          gmail_token_expiry: '1234567890',
        }])); // Credentials found

      await handleGmailWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ received: true });
    });

    it('should handle non-Pub/Sub message gracefully', async () => {
      mockReq.body = { someOtherData: 'test' };

      await handleGmailWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ received: true });
    });

    it('should handle missing user gracefully', async () => {
      const notificationData = {
        emailAddress: 'unknown@example.com',
        historyId: '12345',
      };

      mockReq.body = {
        message: {
          data: Buffer.from(JSON.stringify(notificationData)).toString('base64'),
          messageId: 'msg123',
          publishTime: new Date().toISOString(),
        },
      };

      (pool.query as jest.Mock).mockResolvedValueOnce(createQueryResult([])); // No user found

      await handleGmailWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ received: true });
    });

    it('should handle missing credentials gracefully', async () => {
      const notificationData = {
        emailAddress: 'test@example.com',
        historyId: '12345',
      };

      mockReq.body = {
        message: {
          data: Buffer.from(JSON.stringify(notificationData)).toString('base64'),
          messageId: 'msg123',
          publishTime: new Date().toISOString(),
        },
      };

      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([{ user_id: 'user123' }])) // User found
        .mockResolvedValueOnce(createQueryResult([])); // No credentials found

      await handleGmailWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ received: true });
    });

    it('should handle invalid base64 data', async () => {
      mockReq.body = {
        message: {
          data: 'invalid-base64!!!',
          messageId: 'msg123',
          publishTime: new Date().toISOString(),
        },
      };

      await handleGmailWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to process Gmail webhook',
      });
    });

    it('should handle database errors gracefully', async () => {
      const notificationData = {
        emailAddress: 'test@example.com',
        historyId: '12345',
      };

      mockReq.body = {
        message: {
          data: Buffer.from(JSON.stringify(notificationData)).toString('base64'),
          messageId: 'msg123',
          publishTime: new Date().toISOString(),
        },
      };

      // Database error during user lookup - processGmailNotification catches and logs, returns success
      (pool.query as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      await handleGmailWebhook(mockReq, mockRes);

      // The function catches errors in processGmailNotification and still returns success
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ received: true });
    });
  });

  describe('setupGmailWatch', () => {
    it('should set up Gmail watch subscription', async () => {
      mockReq.body = {
        userId: 'user123',
        emailAddress: 'test@example.com',
      };

      (pool.query as jest.Mock).mockResolvedValueOnce(
        createQueryResult([{
          gmail_access_token: 'token123',
          gmail_refresh_token: 'refresh123',
          gmail_token_expiry: '1234567890',
        }])
      );

      // Mock Gmail API
      const mockGmail = {
        users: {
          watch: jest.fn().mockResolvedValue({
            data: { historyId: '12345', expiration: Date.now() + 86400000 },
          }),
        },
      };
      const { google } = require('googleapis');
      (google.gmail as jest.Mock).mockReturnValue(mockGmail);

      await setupGmailWatch(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
    });

    it('should handle missing userId or emailAddress', async () => {
      mockReq.body = { userId: 'user123' }; // Missing emailAddress

      await setupGmailWatch(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'userId and emailAddress are required',
      });
    });

    it('should handle missing credentials', async () => {
      mockReq.body = {
        userId: 'user123',
        emailAddress: 'test@example.com',
      };

      (pool.query as jest.Mock).mockResolvedValueOnce(createQueryResult([]));

      await setupGmailWatch(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Gmail credentials not found',
      });
    });
  });
});
