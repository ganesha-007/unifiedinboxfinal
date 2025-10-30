import express from 'express';
import { pool } from '../../config/database';
import {
  getOutlookAccounts,
  getOutlookChats,
  getOutlookMessages,
  sendOutlookMessage,
} from '../../controllers/outlook.controller';
import {
  createTestUser,
  createTestAccount,
  createTestChat,
  createTestMessage,
  resetAllMocks,
} from './setup';
import { createQueryResult } from '../helpers';

jest.mock('../../config/database', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../../services/bounceComplaint.service', () => ({
  BounceComplaintService: {
    shouldBlockEmail: jest.fn().mockResolvedValue({ blocked: false }),
  },
}));

// Mock global fetch
global.fetch = jest.fn() as jest.Mock;

describe('Outlook Provider Integration Tests', () => {
  const testUserId = 'test-user-123';
  const testAccountId = 'outlook-account-123';
  const testChatId = 'thread-123';

  beforeEach(() => {
    resetAllMocks();
  });

  describe('GET /channels/outlook/accounts', () => {
    it('should return connected Outlook accounts', async () => {
      const mockAccount = createTestAccount('outlook', testAccountId);
      
      (pool.query as jest.Mock).mockResolvedValueOnce(
        createQueryResult([mockAccount])
      );

      const req: any = { user: createTestUser(testUserId) };
      const res: any = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };

      await getOutlookAccounts(req, res);

      expect(res.json).toHaveBeenCalled();
      const accounts = res.json.mock.calls[0][0];
      expect(accounts).toBeInstanceOf(Array);
    });
  });

  describe('GET /channels/outlook/:accountId/chats', () => {
    it('should return Outlook conversations as chats', async () => {
      const mockChat = createTestChat(testChatId);
      
      // Mock fetch for token refresh
      (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'new-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
        }),
      });
      
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([{ 
          outlook_access_token: 'token', 
          outlook_refresh_token: 'refresh-token',
          outlook_token_expiry: Date.now() + 10000, // Valid token
        }]))
        .mockResolvedValueOnce(createQueryResult([mockChat]))
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])); // resolveAccountId

      const { Client } = require('@microsoft/microsoft-graph-client');
      const mockPost = jest.fn().mockResolvedValue({ id: 'new-msg-123' });
      const mockClient = {
        api: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({
            value: [{ id: testChatId }],
          }),
          post: mockPost,
        })),
      };
      Client.initWithMiddleware.mockReturnValue(mockClient);

      const req: any = {
        user: createTestUser(testUserId),
        params: { accountId: testAccountId },
      };
      const res: any = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };

      await getOutlookChats(req, res);

      expect(res.json).toHaveBeenCalled();
    });
  });

  describe('POST /channels/outlook/:accountId/chats/:chatId/send', () => {
    it('should send an Outlook message', async () => {
      const mockAccount = createTestAccount('outlook', testAccountId);
      const mockChat = createTestChat(testChatId);

      // Mock fetch for token refresh
      (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'new-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
        }),
      });

      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([mockAccount])) // getOutlookAccounts
        .mockResolvedValueOnce(createQueryResult([{ 
          outlook_access_token: 'token', 
          outlook_refresh_token: 'refresh-token',
          outlook_token_expiry: Date.now() + 10000, // Valid token
          outlook_email: 'test@example.com' 
        }])) // getOutlookCredentials
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // resolveAccountId
        .mockResolvedValueOnce(createQueryResult([mockChat])) // getOutlookChats (not used but might be called)
        .mockResolvedValueOnce(createQueryResult([{ count: '0' }])) // BounceComplaintService.shouldBlockEmail - hard bounce count
        .mockResolvedValueOnce(createQueryResult([{ count: '0' }])) // BounceComplaintService.shouldBlockEmail - complaint count
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // Chat lookup for storing message
        .mockResolvedValueOnce(createQueryResult([])); // Store sent message

      const { Client } = require('@microsoft/microsoft-graph-client');
      const mockPost = jest.fn().mockResolvedValue({ id: 'new-msg-123' });
      const mockClient = {
        api: jest.fn((path: string) => {
          // Handle /me/sendMail endpoint
          if (path === '/me/sendMail') {
            return {
              post: mockPost,
            };
          }
          // Handle conversation lookup
          if (path === '/me/messages') {
            return {
              select: jest.fn().mockReturnThis(),
              filter: jest.fn().mockReturnThis(),
              top: jest.fn().mockReturnThis(),
              get: jest.fn().mockResolvedValue({ value: [] }),
            };
          }
          return {
            post: mockPost,
          };
        }),
      };
      Client.initWithMiddleware.mockReturnValue(mockClient);

      const req: any = {
        user: createTestUser(testUserId),
        params: { accountId: testAccountId, chatId: testChatId },
        body: {
          body: 'Test Outlook message',
          subject: 'Test Subject',
          to: 'recipient@example.com',
          attachments: [],
        },
      };
      const res: any = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };

      await sendOutlookMessage(req, res);

      expect(mockPost).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe('End-to-End Outlook Flow', () => {
    it('should complete full Outlook message flow', async () => {
      const mockAccount = createTestAccount('outlook', testAccountId);
      const mockChat = createTestChat(testChatId);

      // Mock fetch for token refresh
      (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'new-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
        }),
      });

      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([mockAccount])) // getOutlookAccounts
        .mockResolvedValueOnce(createQueryResult([{ 
          outlook_access_token: 'token', 
          outlook_refresh_token: 'refresh-token',
          outlook_token_expiry: Date.now() + 10000, // Valid token
          outlook_email: 'test@example.com' 
        }])) // getOutlookCredentials
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // resolveAccountId
        .mockResolvedValueOnce(createQueryResult([mockChat])) // getOutlookChats (not used but might be called)
        .mockResolvedValueOnce(createQueryResult([{ count: '0' }])) // BounceComplaintService.shouldBlockEmail - hard bounce count
        .mockResolvedValueOnce(createQueryResult([{ count: '0' }])) // BounceComplaintService.shouldBlockEmail - complaint count
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // Chat lookup for storing message
        .mockResolvedValueOnce(createQueryResult([])); // Store sent message

      const { Client } = require('@microsoft/microsoft-graph-client');
      const mockPost = jest.fn().mockResolvedValue({ id: 'new-msg' });
      const mockClient = {
        api: jest.fn((path: string) => {
          if (path === '/me/sendMail') {
            return {
              post: mockPost,
            };
          }
          return {
            get: jest.fn().mockResolvedValue({ value: [] }),
            post: mockPost,
          };
        }),
      };
      Client.initWithMiddleware.mockReturnValue(mockClient);

      const req: any = {
        user: createTestUser(testUserId),
        params: { accountId: testAccountId, chatId: testChatId },
        body: {
          body: 'Hello Outlook',
          subject: 'Test',
          to: 'recipient@example.com',
        },
      };
      const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await sendOutlookMessage(req, res);

      expect(mockPost).toHaveBeenCalled();
    });
  });
});
