import express from 'express';
import { pool } from '../../config/database';
import { getAccounts, getChats, getMessages, sendMessage } from '../../controllers/channels.controller';
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
    getChats: jest.fn(),
    sendMessage: jest.fn(),
  },
}));
jest.mock('../../controllers/user-credentials.controller', () => ({
  getUserUniPileService: jest.fn(),
}));

describe('Instagram Provider Integration Tests', () => {
  const testUserId = 'test-user-123';
  const testAccountId = 'instagram-account-123';
  const testChatId = 'chat-123';

  beforeEach(() => {
    resetAllMocks();
  });

  describe('GET /channels/instagram/accounts', () => {
    it('should return connected Instagram accounts', async () => {
      const mockAccount = createTestAccount('instagram', testAccountId);
      
      (pool.query as jest.Mock).mockResolvedValueOnce(
        createQueryResult([mockAccount])
      );

      const { getUserUniPileService } = require('../../controllers/user-credentials.controller');
      getUserUniPileService.mockResolvedValueOnce({
        getAccounts: jest.fn().mockResolvedValue([{
          id: testAccountId,
          type: 'INSTAGRAM',
          status: 'connected',
          username: 'testuser',
        }]),
      });

      const req: any = { user: createTestUser(testUserId), originalUrl: '/api/channels/instagram/accounts' };
      const res: any = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };

      await getAccounts(req, res);

      expect(res.json).toHaveBeenCalled();
      const accounts = res.json.mock.calls[0][0];
      expect(accounts).toBeInstanceOf(Array);
    });
  });

  describe('GET /channels/instagram/:accountId/chats', () => {
    it('should return chats for an Instagram account', async () => {
      const mockChat = createTestChat(testChatId);
      
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // Account check
        .mockResolvedValueOnce(createQueryResult([mockChat])); // Chats

      const req: any = {
        user: createTestUser(testUserId),
        params: { accountId: testAccountId },
        originalUrl: '/api/channels/instagram/account-123/chats',
      };
      const res: any = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };

      await getChats(req, res);

      expect(res.json).toHaveBeenCalled();
    });
  });

  describe('POST /channels/instagram/:accountId/chats/:chatId/send', () => {
    it('should send an Instagram message', async () => {
      const mockAccount = createTestAccount('instagram', testAccountId);
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
        body: { body: 'Test Instagram message', attachments: [] },
        originalUrl: '/api/channels/instagram/account-123/chat-123/send',
      };
      const res: any = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };

      await sendMessage(req, res);

      expect(unipileService.sendMessage).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe('End-to-End Instagram Flow', () => {
    it('should complete full Instagram message flow', async () => {
      const mockAccount = createTestAccount('instagram', testAccountId);
      const mockChat = createTestChat(testChatId);
      const { unipileService } = require('../../services/unipile.service');

      unipileService.sendMessage.mockResolvedValue({ id: 'new-msg', status: 'sent' });

      // Full flow
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // Account check
        .mockResolvedValueOnce(createQueryResult([{ id: 1, provider_chat_id: testChatId, metadata: JSON.stringify({ id: testChatId }) }])) // Chat check
        .mockResolvedValueOnce(createQueryResult([])); // Insert message

      const req: any = {
        user: createTestUser(testUserId),
        params: { accountId: testAccountId, chatId: testChatId },
        body: { body: 'Hello Instagram' },
        originalUrl: '/api/channels/instagram/account-123/chat-123/send',
      };
      const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await sendMessage(req, res);

      expect(unipileService.sendMessage).toHaveBeenCalled();
    });
  });
});
