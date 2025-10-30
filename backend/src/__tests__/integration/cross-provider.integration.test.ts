import express from 'express';
import { pool } from '../../config/database';
import { getAccounts, sendMessage } from '../../controllers/channels.controller';
import { sendGmailMessage } from '../../controllers/gmail.controller';
import { sendOutlookMessage } from '../../controllers/outlook.controller';
import {
  createTestUser,
  createTestAccount,
  resetAllMocks,
} from './setup';
import { createQueryResult } from '../helpers';

jest.mock('../../config/database', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../../services/unipile.service', () => ({
  unipileService: {
    getAccounts: jest.fn(),
    getChats: jest.fn(),
    sendMessage: jest.fn(),
  },
}));
jest.mock('../../controllers/user-credentials.controller', () => ({
  getUserUniPileService: jest.fn(),
  getUserWhatsAppPhone: jest.fn(),
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

// Mock global fetch
global.fetch = jest.fn() as jest.Mock;

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
      })),
    },
    gmail: jest.fn(() => ({
      users: {
        messages: {
          send: jest.fn(),
        },
      },
    })),
  },
}));

jest.mock('@microsoft/microsoft-graph-client', () => ({
  Client: {
    initWithMiddleware: jest.fn(() => ({
      api: jest.fn(() => ({
        post: jest.fn(),
      })),
    })),
  },
}));

describe('Cross-Provider Integration Tests', () => {
  const testUserId = 'test-user-123';

  beforeEach(() => {
    resetAllMocks();
  });

  describe('Multi-Provider Account Retrieval', () => {
    it('should retrieve accounts from all providers', async () => {
      const mockWhatsAppAccount = createTestAccount('whatsapp', 'wa-123');
      const mockInstagramAccount = createTestAccount('instagram', 'ig-123');
      const mockGmailAccount = createTestAccount('email', 'gmail-123');
      const mockOutlookAccount = createTestAccount('outlook', 'outlook-123');

      // Mock WhatsApp accounts
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([mockWhatsAppAccount]));
      
      const { getUserUniPileService } = require('../../controllers/user-credentials.controller');
      getUserUniPileService.mockResolvedValue({
        getAccounts: jest.fn().mockResolvedValue([
          { id: 'wa-123', type: 'WHATSAPP' },
          { id: 'ig-123', type: 'INSTAGRAM' },
        ]),
      });

      const reqWhatsApp: any = {
        user: createTestUser(testUserId),
        originalUrl: '/api/channels/whatsapp/accounts',
      };
      const resWhatsApp: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await getAccounts(reqWhatsApp, resWhatsApp);

      // Mock Instagram accounts
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([mockInstagramAccount]));

      const reqInstagram: any = {
        user: createTestUser(testUserId),
        originalUrl: '/api/channels/instagram/accounts',
      };
      const resInstagram: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await getAccounts(reqInstagram, resInstagram);

      // Mock Gmail accounts
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([mockGmailAccount]));

      const { getGmailAccounts } = require('../../controllers/gmail.controller');
      const reqGmail: any = { user: createTestUser(testUserId) };
      const resGmail: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await getGmailAccounts(reqGmail, resGmail);

      // Mock Outlook accounts
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([mockOutlookAccount]));

      const { getOutlookAccounts } = require('../../controllers/outlook.controller');
      const reqOutlook: any = { user: createTestUser(testUserId) };
      const resOutlook: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await getOutlookAccounts(reqOutlook, resOutlook);

      expect(resWhatsApp.json).toHaveBeenCalled();
      expect(resInstagram.json).toHaveBeenCalled();
      expect(resGmail.json).toHaveBeenCalled();
      expect(resOutlook.json).toHaveBeenCalled();
    });
  });

  describe('Cross-Provider Message Sending', () => {
    it('should send messages across different providers', async () => {
      const mockWhatsAppAccount = createTestAccount('whatsapp', 'wa-123');
      const mockInstagramAccount = createTestAccount('instagram', 'ig-123');
      const mockGmailAccount = createTestAccount('email', 'gmail-123');
      const mockOutlookAccount = createTestAccount('outlook', 'outlook-123');

      // Setup WhatsApp send
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([mockWhatsAppAccount]))
        .mockResolvedValueOnce(createQueryResult([{ id: 1, provider_chat_id: 'chat-123', metadata: JSON.stringify({ id: 'chat-123' }) }])) // Chat
        .mockResolvedValueOnce(createQueryResult([])); // Insert message

      const { unipileService } = require('../../services/unipile.service');
      unipileService.sendMessage.mockResolvedValue({ id: 'wa-msg', status: 'sent' });

      const reqWhatsApp: any = {
        user: createTestUser(testUserId),
        params: { accountId: 'wa-123', chatId: 'chat-123' },
        body: { body: 'WhatsApp message' },
        originalUrl: '/api/channels/whatsapp/wa-123/chat-123/send',
      };
      const resWhatsApp: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await sendMessage(reqWhatsApp, resWhatsApp);

      // Setup Instagram send
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([mockInstagramAccount]))
        .mockResolvedValueOnce(createQueryResult([{ id: 1, provider_chat_id: 'chat-123', metadata: JSON.stringify({ id: 'chat-123' }) }])) // Chat
        .mockResolvedValueOnce(createQueryResult([])); // Insert message

      unipileService.sendMessage.mockResolvedValue({ id: 'ig-msg', status: 'sent' });

      const reqInstagram: any = {
        user: createTestUser(testUserId),
        params: { accountId: 'ig-123', chatId: 'chat-123' },
        body: { body: 'Instagram message' },
        originalUrl: '/api/channels/instagram/ig-123/chat-123/send',
      };
      const resInstagram: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await sendMessage(reqInstagram, resInstagram);

      // Setup Gmail send
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([mockGmailAccount]))
        .mockResolvedValueOnce(createQueryResult([{ gmail_access_token: 'token', gmail_email: 'test@example.com' }]))
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])); // Chat

      const { google } = require('googleapis');
      const mockGmail = {
        users: {
          messages: {
            send: jest.fn().mockResolvedValue({ data: { id: 'gmail-msg' } }),
          },
        },
      };
      (google.gmail as jest.Mock).mockReturnValue(mockGmail);

      const reqGmail: any = {
        user: createTestUser(testUserId),
        params: { accountId: 'gmail-123', chatId: 'chat-123' },
        body: {
          body: 'Gmail message',
          subject: 'Test',
          to: 'recipient@example.com',
        },
      };
      const resGmail: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await sendGmailMessage(reqGmail, resGmail);

      // Setup Outlook send
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
        .mockResolvedValueOnce(createQueryResult([mockOutlookAccount])) // getOutlookAccounts
        .mockResolvedValueOnce(createQueryResult([{ 
          outlook_access_token: 'token', 
          outlook_refresh_token: 'refresh-token',
          outlook_token_expiry: Date.now() + 10000, // Valid token
          outlook_email: 'test@example.com' 
        }])) // getOutlookCredentials
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // resolveAccountId
        .mockResolvedValueOnce(createQueryResult([{ count: '0' }])) // BounceComplaintService.shouldBlockEmail - hard bounce count
        .mockResolvedValueOnce(createQueryResult([{ count: '0' }])) // BounceComplaintService.shouldBlockEmail - complaint count
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // Chat lookup for storing message
        .mockResolvedValueOnce(createQueryResult([])); // Store sent message

      const { Client } = require('@microsoft/microsoft-graph-client');
      const mockGet = jest.fn().mockResolvedValue({ 
        value: [{ 
          from: { emailAddress: { address: 'recipient@example.com' } },
          toRecipients: [{ emailAddress: { address: 'recipient@example.com' } }]
        }] 
      }); // Conversation messages with valid recipients
      const mockPost = jest.fn().mockResolvedValue({ id: 'outlook-msg' });
      const mockClient = {
        api: jest.fn((path: string) => {
          if (path === '/me/sendMail') {
            return {
              post: mockPost,
            };
          }
          if (path.includes('/me/messages') && (path.includes('filter') || path.includes('orderby'))) {
            return {
              select: jest.fn().mockReturnThis(),
              filter: jest.fn().mockReturnThis(),
              top: jest.fn().mockReturnThis(),
              orderby: jest.fn().mockReturnThis(),
              get: mockGet,
            };
          }
          return {
            post: mockPost,
          };
        }),
      };
      Client.initWithMiddleware.mockReturnValue(mockClient);

      const reqOutlook: any = {
        user: createTestUser(testUserId),
        params: { accountId: 'outlook-123', chatId: 'chat-123' },
        body: {
          body: 'Outlook message',
          subject: 'Test',
          to: 'recipient@example.com', // Valid recipient
        },
      };
      const resOutlook: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await sendOutlookMessage(reqOutlook, resOutlook);

      // Verify all messages were sent
      expect(unipileService.sendMessage).toHaveBeenCalledTimes(2); // WhatsApp + Instagram
      expect(mockGmail.users.messages.send).toHaveBeenCalled();
      expect(mockPost).toHaveBeenCalled();
    });
  });

  describe('Provider-Specific Error Handling', () => {
    it('should handle errors from different providers gracefully', async () => {
      // Test WhatsApp error
      (pool.query as jest.Mock).mockResolvedValueOnce(createQueryResult([]));

      const reqWhatsApp: any = {
        user: createTestUser(testUserId),
        params: { accountId: 'wa-123', chatId: 'chat-123' },
        body: { body: 'Test' },
        originalUrl: '/api/channels/whatsapp/wa-123/chat-123/send',
      };
      const resWhatsApp: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await sendMessage(reqWhatsApp, resWhatsApp);

      expect(resWhatsApp.status).toHaveBeenCalledWith(404);

      // Test Gmail error - account not found returns 400 (missing to field validation)
      (pool.query as jest.Mock).mockResolvedValueOnce(createQueryResult([]));

      const reqGmail: any = {
        user: createTestUser(testUserId),
        params: { accountId: 'gmail-123', chatId: 'chat-123' },
        body: { body: 'Test' }, // Missing 'to' field
      };
      const resGmail: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await sendGmailMessage(reqGmail, resGmail);

      // Gmail controller validates 'to' field and returns 400 if missing
      expect(resGmail.status).toHaveBeenCalledWith(400);
    });
  });

  describe('Unified Provider Interface', () => {
    it('should handle requests consistently across all providers', async () => {
      const providers = ['whatsapp', 'instagram', 'email', 'outlook'];
      const results: any[] = [];

      for (const provider of providers) {
        const mockAccount = createTestAccount(provider, `${provider}-123`);
        
        if (provider === 'whatsapp' || provider === 'instagram') {
          (pool.query as jest.Mock).mockResolvedValueOnce(
            createQueryResult([mockAccount])
          );

          const { getUserUniPileService } = require('../../controllers/user-credentials.controller');
          getUserUniPileService.mockResolvedValue({
            getAccounts: jest.fn().mockResolvedValue([{
              id: `${provider}-123`,
              type: provider.toUpperCase(),
            }]),
          });

          const req: any = {
            user: createTestUser(testUserId),
            originalUrl: `/api/channels/${provider}/accounts`,
          };
          const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
          await getAccounts(req, res);
          results.push(res.json.mock.calls[0][0]);
        } else if (provider === 'email') {
          (pool.query as jest.Mock).mockResolvedValueOnce(
            createQueryResult([mockAccount])
          );

          const { getGmailAccounts } = require('../../controllers/gmail.controller');
          const req: any = { user: createTestUser(testUserId) };
          const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
          await getGmailAccounts(req, res);
          results.push(res.json.mock.calls[0][0]);
        } else if (provider === 'outlook') {
          (pool.query as jest.Mock).mockResolvedValueOnce(
            createQueryResult([mockAccount])
          );

          const { getOutlookAccounts } = require('../../controllers/outlook.controller');
          const req: any = { user: createTestUser(testUserId) };
          const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
          await getOutlookAccounts(req, res);
          results.push(res.json.mock.calls[0][0]);
        }
      }

      // All providers should return arrays
      results.forEach(result => {
        expect(result).toBeInstanceOf(Array);
      });
    });
  });
});
