import request from 'supertest';
import express from 'express';
import { pool } from '../../config/database';
import {
  createMockRequest,
  createMockResponse,
  createQueryResult,
} from '../helpers';

// Mock database
jest.mock('../../config/database', () => ({
  pool: {
    query: jest.fn(),
  },
}));

// Mock external services
jest.mock('../../services/unipile.service');
jest.mock('googleapis');
jest.mock('@microsoft/microsoft-graph-client');

// Test utilities
export const createTestApp = () => {
  const app = express();
  app.use(express.json());
  return app;
};

export const createTestUser = (userId: string = 'test-user-123') => ({
  id: userId,
  email: `test${userId}@example.com`,
});

export const createTestAccount = (provider: string, accountId: string = 'test-account-123') => ({
  id: accountId,
  external_account_id: accountId,
  user_id: 'test-user-123',
  provider,
  status: 'connected',
  created_at: new Date().toISOString(),
});

export const createTestChat = (chatId: string = 'test-chat-123') => ({
  id: chatId,
  provider_chat_id: chatId,
  account_id: 'test-account-123',
  title: 'Test Chat',
  last_message_at: new Date().toISOString(),
});

export const createTestMessage = (messageId: string = 'test-msg-123') => ({
  id: messageId,
  provider_msg_id: messageId,
  chat_id: 'test-chat-123',
  direction: 'in',
  body: 'Test message',
  sent_at: new Date().toISOString(),
});

// Helper to mock authenticated request
export const mockAuthenticatedRequest = (req: any, userId: string = 'test-user-123') => {
  req.user = createTestUser(userId);
};

// Helper to reset all mocks
export const resetAllMocks = () => {
  jest.clearAllMocks();
};
