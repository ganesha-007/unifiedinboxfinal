import request from 'supertest';
import express from 'express';
import { pool } from '../../config/database';
import { getAccounts, getChats, getMessages, sendMessage } from '../../controllers/channels.controller';
import { authenticate } from '../../middleware/auth';
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

jest.mock('../../services/unipile.service', () => ({
  unipileService: {
    getAccounts: jest.fn(),
    sendMessage: jest.fn(),
  },
}));

jest.mock('../../controllers/user-credentials.controller', () => ({
  getUserUniPileService: jest.fn(),
  getUserWhatsAppPhone: jest.fn(),
}));

describe('WhatsApp Provider Integration Tests', () => {
  let app: express.Application;
  const testUserId = 'test-user-123';
  const testAccountId = 'whatsapp-account-123';
  const testChatId = 'chat-123';

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use((req: any, res: any, next: any) => {
      req.user = createTestUser(testUserId);
      next();
    });
    
    resetAllMocks();
  });

  describe('GET /channels/whatsapp/accounts', () => {
    it('should return connected WhatsApp accounts', async () => {
      const mockAccount = createTestAccount('whatsapp', testAccountId);
      
      (pool.query as jest.Mock).mockResolvedValueOnce(
        createQueryResult([mockAccount])
      );

      const { getUserUniPileService } = require('../../controllers/user-credentials.controller');
      getUserUniPileService.mockResolvedValueOnce({
        getAccounts: jest.fn().mockResolvedValue([{
          id: testAccountId,
          type: 'WHATSAPP',
          status: 'connected',
          phone_number: '919566651479',
        }]),
      });

      const req: any = { user: createTestUser(testUserId), originalUrl: '/api/channels/whatsapp/accounts' };
      const res: any = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };

      await getAccounts(req, res);

      expect(res.json).toHaveBeenCalled();
      const accounts = res.json.mock.calls[0][0];
      expect(accounts).toBeInstanceOf(Array);
      expect(accounts.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle missing UniPile credentials gracefully', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce(createQueryResult([]));

      const { getUserUniPileService } = require('../../controllers/user-credentials.controller');
      getUserUniPileService.mockResolvedValueOnce(null);

      const req: any = { user: createTestUser(testUserId), originalUrl: '/api/channels/whatsapp/accounts' };
      const res: any = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };

      await getAccounts(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });
  });

  describe('GET /channels/whatsapp/:accountId/chats', () => {
    it('should return chats for a WhatsApp account', async () => {
      const mockChat = createTestChat(testChatId);
      const { unipileService } = require('../../services/unipile.service');
      
      // Mock unipileService.getChats BEFORE using it
      unipileService.getChats = jest.fn().mockResolvedValue([{
        provider_id: '1234567890@s.whatsapp.net',
        timestamp: new Date().toISOString(),
      }]);
      
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // Account check
        .mockResolvedValueOnce(createQueryResult([mockChat])) // Initial chats
        .mockResolvedValueOnce(createQueryResult([])) // Delete duplicates
        .mockResolvedValueOnce(createQueryResult([mockChat])) // Updated chats
        .mockResolvedValueOnce(createQueryResult([mockChat])); // Updated chats result

      const req: any = {
        user: createTestUser(testUserId),
        params: { accountId: testAccountId },
        originalUrl: '/api/channels/whatsapp/account-123/chats',
      };
      const res: any = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };

      await getChats(req, res);

      expect(res.json).toHaveBeenCalled();
      const chats = res.json.mock.calls[0][0];
      expect(chats).toBeInstanceOf(Array);
    });

    it('should handle account not found', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce(createQueryResult([]));

      const req: any = {
        user: createTestUser(testUserId),
        params: { accountId: 'non-existent' },
        originalUrl: '/api/channels/whatsapp/non-existent/chats',
      };
      const res: any = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };

      await getChats(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('GET /channels/whatsapp/:accountId/chats/:chatId/messages', () => {
    it('should return messages for a chat', async () => {
      const mockMessage = createTestMessage('msg-123');
      
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // Account check
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // Chat check
        .mockResolvedValueOnce(createQueryResult([mockMessage])); // Messages

      const req: any = {
        user: createTestUser(testUserId),
        params: { accountId: testAccountId, chatId: testChatId },
        query: { limit: '50', offset: '0' },
        originalUrl: '/api/channels/whatsapp/account-123/chats/chat-123/messages',
      };
      const res: any = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };

      await getMessages(req, res);

      expect(res.json).toHaveBeenCalled();
      const messages = res.json.mock.calls[0][0];
      expect(messages).toBeInstanceOf(Array);
    });
  });

  describe('POST /channels/whatsapp/:accountId/chats/:chatId/send', () => {
    it('should send a WhatsApp message', async () => {
      const mockAccount = createTestAccount('whatsapp', testAccountId);
      const mockChat = createTestChat(testChatId);
      const { unipileService } = require('../../services/unipile.service');

      unipileService.sendMessage.mockResolvedValue({
        id: 'new-msg-123',
        status: 'sent',
      });

      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // Account check
        .mockResolvedValueOnce(createQueryResult([{ id: 1, provider_chat_id: testChatId, metadata: JSON.stringify({ id: testChatId }) }])) // Chat check
        .mockResolvedValueOnce(createQueryResult([])); // Insert message

      const req: any = {
        user: createTestUser(testUserId),
        params: { accountId: testAccountId, chatId: testChatId },
        body: { body: 'Test message', attachments: [] },
        originalUrl: '/api/channels/whatsapp/account-123/chat-123/send',
      };
      const res: any = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };

      await sendMessage(req, res);

      expect(unipileService.sendMessage).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();
    });

    it('should handle send errors gracefully', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce(createQueryResult([]));

      const req: any = {
        user: createTestUser(testUserId),
        params: { accountId: testAccountId, chatId: testChatId },
        body: { body: 'Test message' },
        originalUrl: '/api/channels/whatsapp/account-123/chat-123/send',
      };
      const res: any = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('End-to-End WhatsApp Flow', () => {
    it('should complete full WhatsApp message flow', async () => {
      const mockAccount = createTestAccount('whatsapp', testAccountId);
      const mockChat = createTestChat(testChatId);
      const mockMessage = createTestMessage('msg-123');
      const { unipileService } = require('../../services/unipile.service');

      // Setup mocks
      unipileService.getChats = jest.fn().mockResolvedValue([{
        provider_id: '1234567890@s.whatsapp.net',
        timestamp: new Date().toISOString(),
      }]);
      
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([mockAccount])) // Get account
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // Account check for chats
        .mockResolvedValueOnce(createQueryResult([mockChat])) // Initial chats
        .mockResolvedValueOnce(createQueryResult([])) // Delete duplicates
        .mockResolvedValueOnce(createQueryResult([mockChat])) // Updated chats
        .mockResolvedValueOnce(createQueryResult([mockChat])) // Updated chats result
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // Account check for messages
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // Chat check
        .mockResolvedValueOnce(createQueryResult([mockMessage])) // Get messages
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // Account check for send
        .mockResolvedValueOnce(createQueryResult([{ id: 1, provider_chat_id: testChatId, metadata: JSON.stringify({ id: testChatId }) }])) // Chat check for send
        .mockResolvedValueOnce(createQueryResult([])); // Insert message

      unipileService.sendMessage.mockResolvedValue({ id: 'new-msg', status: 'sent' });

      // 1. Get accounts
      const req1: any = {
        user: createTestUser(testUserId),
        originalUrl: '/api/channels/whatsapp/accounts',
      };
      const res1: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await getAccounts(req1, res1);
      expect(res1.json).toHaveBeenCalled();

      // 2. Get chats
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // Account check
        .mockResolvedValueOnce(createQueryResult([mockChat])); // Chats
      
      const req2: any = {
        user: createTestUser(testUserId),
        params: { accountId: testAccountId },
        originalUrl: '/api/channels/whatsapp/account-123/chats',
      };
      const res2: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await getChats(req2, res2);
      expect(res2.json).toHaveBeenCalled();

      // 3. Get messages
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // Account check
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // Chat check
        .mockResolvedValueOnce(createQueryResult([mockMessage])); // Messages
      
      const req3: any = {
        user: createTestUser(testUserId),
        params: { accountId: testAccountId, chatId: testChatId },
        query: {},
        originalUrl: '/api/channels/whatsapp/account-123/chats/chat-123/messages',
      };
      const res3: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await getMessages(req3, res3);
      expect(res3.json).toHaveBeenCalled();

      // 4. Send message
      const req4: any = {
        user: createTestUser(testUserId),
        params: { accountId: testAccountId, chatId: testChatId },
        body: { body: 'Hello from test' },
        originalUrl: '/api/channels/whatsapp/account-123/chat-123/send',
      };
      const res4: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await sendMessage(req4, res4);
      expect(unipileService.sendMessage).toHaveBeenCalled();
    });
  });
});
