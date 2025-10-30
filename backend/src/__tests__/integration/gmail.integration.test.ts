import express from 'express';
import { pool } from '../../config/database';
import {
  getGmailAccounts,
  getGmailChats,
  getGmailMessages,
  sendGmailMessage,
} from '../../controllers/gmail.controller';
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

jest.mock('../../services/emailLimits.service', () => ({
  EmailLimitsService: {
    enforceLimits: jest.fn().mockResolvedValue(undefined),
    updateCooldowns: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('googleapis', () => {
  const mockSend = jest.fn().mockResolvedValue({ data: { id: 'default-msg' } });
  
  // Create the mock Gmail function that always returns the same structure with the same send function
  const mockGmailFn = jest.fn(() => ({
    users: {
      threads: {
        list: jest.fn().mockResolvedValue({ data: { threads: [] } }),
        get: jest.fn().mockResolvedValue({ data: { messages: [] } }),
      },
      messages: {
        send: mockSend, // Use the same reference
      },
    },
  }));
  
  return {
    google: {
      auth: {
        OAuth2: jest.fn().mockImplementation(() => ({
          setCredentials: jest.fn(),
          getRequestMetadata: jest.fn().mockResolvedValue({ headers: {} }),
        })),
      },
      gmail: mockGmailFn,
    },
    __mockSend: mockSend, // Export mockSend for test access
  };
});

describe('Gmail Provider Integration Tests', () => {
  const testUserId = 'test-user-123';
  const testAccountId = 'gmail-account-123';
  const testChatId = 'thread-123';

  beforeEach(() => {
    resetAllMocks();
    // Reset EmailLimitsService mocks
    const { EmailLimitsService } = require('../../services/emailLimits.service');
    EmailLimitsService.enforceLimits = jest.fn().mockResolvedValue(undefined);
    EmailLimitsService.updateCooldowns = jest.fn().mockResolvedValue(undefined);
  });

  describe('GET /channels/email/accounts', () => {
    it('should return connected Gmail accounts', async () => {
      const mockAccount = createTestAccount('email', testAccountId);
      
      (pool.query as jest.Mock).mockResolvedValueOnce(
        createQueryResult([mockAccount])
      );

      const req: any = { user: createTestUser(testUserId) };
      const res: any = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };

      await getGmailAccounts(req, res);

      expect(res.json).toHaveBeenCalled();
      const accounts = res.json.mock.calls[0][0];
      expect(accounts).toBeInstanceOf(Array);
    });
  });

  describe('GET /channels/email/:accountId/chats', () => {
    it('should return Gmail threads as chats', async () => {
      const mockChat = createTestChat(testChatId);
      
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([{ gmail_access_token: 'token' }]))
        .mockResolvedValueOnce(createQueryResult([mockChat]));

      const { google } = require('googleapis');
      // Update the mock to include threads.list
      const originalGmailFn = google.gmail;
      (google.gmail as jest.Mock).mockImplementation(() => ({
        users: {
          threads: {
            list: jest.fn().mockResolvedValue({
              data: {
                threads: [{ id: testChatId }],
              },
            }),
            get: jest.fn().mockResolvedValue({ data: { messages: [] } }),
          },
          messages: {
            send: require('googleapis').__mockSend,
          },
        },
      }));

      const req: any = {
        user: createTestUser(testUserId),
        params: { accountId: testAccountId },
      };
      const res: any = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };

      await getGmailChats(req, res);

      expect(res.json).toHaveBeenCalled();
    });
  });

  describe('GET /channels/email/:accountId/chats/:chatId/messages', () => {
    it('should return messages from a Gmail thread', async () => {
      const mockMessage = createTestMessage('msg-123');
      
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([{ gmail_access_token: 'token' }]))
        .mockResolvedValueOnce(createQueryResult([mockMessage]));

      const { google } = require('googleapis');
      // Update the mock to include threads.get
      (google.gmail as jest.Mock).mockImplementation(() => ({
        users: {
          threads: {
            list: jest.fn().mockResolvedValue({ data: { threads: [] } }),
            get: jest.fn().mockResolvedValue({
              data: {
                messages: [{ id: 'msg-123' }],
              },
            }),
          },
          messages: {
            send: require('googleapis').__mockSend,
          },
        },
      }));

      const req: any = {
        user: createTestUser(testUserId),
        params: { accountId: testAccountId, chatId: testChatId },
      };
      const res: any = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };

      await getGmailMessages(req, res);

      expect(res.json).toHaveBeenCalled();
    });
  });

  describe('POST /channels/email/:accountId/chats/:chatId/send', () => {
    it('should send a Gmail message', async () => {
      const mockAccount = createTestAccount('email', testAccountId);
      const mockChat = createTestChat(testChatId);

      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([mockAccount]))
        .mockResolvedValueOnce(createQueryResult([{ gmail_access_token: 'token', gmail_email: 'test@example.com', gmail_refresh_token: 'refresh', gmail_token_expiry: Date.now() + 10000 }]))
        .mockResolvedValueOnce(createQueryResult([mockChat]))
        .mockResolvedValueOnce(createQueryResult([{ count: '0' }])) // BounceComplaintService.shouldBlockEmail - hard bounce count
        .mockResolvedValueOnce(createQueryResult([{ count: '0' }])) // BounceComplaintService.shouldBlockEmail - complaint count
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // Chat lookup for storing message
        .mockResolvedValueOnce(createQueryResult([])); // Store message & Update cooldowns

      const { google, __mockSend } = require('googleapis');
      
      // Reset and set up the mock - ensure the mockSend is reset
      __mockSend.mockClear();
      __mockSend.mockResolvedValue({
        data: { id: 'new-msg-123' },
      });
      
      // Force the gmail mock to return an object with our send function
      const originalGmailFn = google.gmail;
      (google.gmail as jest.Mock).mockImplementation(() => ({
        users: {
          threads: {
            list: jest.fn().mockResolvedValue({ data: { threads: [] } }),
            get: jest.fn().mockResolvedValue({ data: { messages: [] } }),
          },
          messages: {
            send: __mockSend, // Use the same reference
          },
        },
      }));

      const req: any = {
        user: createTestUser(testUserId),
        params: { accountId: testAccountId, chatId: testChatId },
        body: {
          body: 'Test Gmail message',
          subject: 'Test Subject',
          to: 'recipient@example.com',
          attachments: [],
        },
      };
      const res: any = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };

      await sendGmailMessage(req, res);

      expect(__mockSend).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe('End-to-End Gmail Flow', () => {
    it('should complete full Gmail message flow', async () => {
      const mockAccount = createTestAccount('email', testAccountId);
      const mockChat = createTestChat(testChatId);

      // Ensure EmailLimitsService mock is set up
      const { EmailLimitsService } = require('../../services/emailLimits.service');
      EmailLimitsService.enforceLimits = jest.fn().mockResolvedValue(undefined);
      EmailLimitsService.updateCooldowns = jest.fn().mockResolvedValue(undefined);

      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([mockAccount]))
        .mockResolvedValueOnce(createQueryResult([{ gmail_access_token: 'token', gmail_email: 'test@example.com', gmail_refresh_token: 'refresh', gmail_token_expiry: Date.now() + 10000 }]))
        .mockResolvedValueOnce(createQueryResult([mockChat]))
        .mockResolvedValueOnce(createQueryResult([{ count: '0' }])) // BounceComplaintService.shouldBlockEmail - hard bounce count
        .mockResolvedValueOnce(createQueryResult([{ count: '0' }])) // BounceComplaintService.shouldBlockEmail - complaint count
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // Chat lookup for storing message
        .mockResolvedValueOnce(createQueryResult([])); // Store message & Update cooldowns

      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([mockAccount]))
        .mockResolvedValueOnce(createQueryResult([{ gmail_access_token: 'token', gmail_email: 'test@example.com', gmail_refresh_token: 'refresh', gmail_token_expiry: Date.now() + 10000 }]))
        .mockResolvedValueOnce(createQueryResult([mockChat]))
        .mockResolvedValueOnce(createQueryResult([{ count: '0' }])) // BounceComplaintService.shouldBlockEmail - hard bounce count
        .mockResolvedValueOnce(createQueryResult([{ count: '0' }])) // BounceComplaintService.shouldBlockEmail - complaint count
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // Chat lookup for storing message
        .mockResolvedValueOnce(createQueryResult([])); // Store message & Update cooldowns

      const { google, __mockSend } = require('googleapis');
      
      // Reset and set up the mock
      __mockSend.mockClear();
      __mockSend.mockResolvedValue({
        data: { id: 'new-msg' },
      });
      
      // Force the gmail mock to return an object with our send function
      (google.gmail as jest.Mock).mockImplementation(() => ({
        users: {
          threads: {
            list: jest.fn().mockResolvedValue({ data: { threads: [] } }),
            get: jest.fn().mockResolvedValue({ data: { messages: [] } }),
          },
          messages: {
            send: __mockSend, // Use the same reference
          },
        },
      }));

      // Send message
      const req: any = {
        user: createTestUser(testUserId),
        params: { accountId: testAccountId, chatId: testChatId },
        body: {
          body: 'Hello Gmail',
          subject: 'Test',
          to: 'recipient@example.com',
        },
      };
      const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await sendGmailMessage(req, res);

      expect(__mockSend).toHaveBeenCalled();
    });
  });
});
