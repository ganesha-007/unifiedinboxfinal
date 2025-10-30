import { handleUniPileMessage, handleUniPileAccountStatus } from '../controllers/webhooks.controller';
import { pool } from '../config/database';
import { getUserWhatsAppPhone } from '../controllers/user-credentials.controller';
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

// Mock socket.io with proper chaining - need to use mockImplementation
const mockIo = {
  to: jest.fn(),
  emit: jest.fn(),
};

// Set initial implementation
mockIo.to.mockImplementation((room: string) => ({
  emit: jest.fn(),
}));

jest.mock('../controllers/user-credentials.controller', () => ({
  getUserWhatsAppPhone: jest.fn().mockResolvedValue('919566651479@s.whatsapp.net'),
  getUserUniPileService: jest.fn(),
}));

describe('UniPile Webhook Handlers', () => {
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    mockReq = createMockRequest();
    mockRes = createMockResponse();
    mockReq.app = {
      get: jest.fn((key: string) => {
        if (key === 'io') {
          return mockIo;
        }
        return undefined;
      }),
    };
    jest.clearAllMocks();
    // Restore socket.io mock implementation after clearing
    mockIo.to.mockImplementation((room: string) => ({
      emit: jest.fn(),
    }));
    // Reset mock return values
    (getUserWhatsAppPhone as jest.Mock).mockResolvedValue('919566651479@s.whatsapp.net');
  });

  describe('handleUniPileMessage', () => {
    it('should handle webhook verification challenge', async () => {
      mockReq.body = { challenge: 'test-challenge-123' };

      await handleUniPileMessage(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ challenge: 'test-challenge-123' });
    });

    it('should reject invalid request body', async () => {
      mockReq.body = null;

      await handleUniPileMessage(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid request body' });
    });

    it('should process valid UniPile message webhook', async () => {
      mockReq.body = {
        account_id: 'acc123',
        message_id: 'msg123',
        text: 'Hello World',
        from: {
          name: 'John Doe',
          phone: '1234567890',
        },
        timestamp: new Date().toISOString(),
      };

      // Mock getUserWhatsAppPhone to return different phone (making it incoming)
      (getUserWhatsAppPhone as jest.Mock).mockResolvedValue('different@s.whatsapp.net');

      // Mock database queries - need to match all queries in order
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([])) // No account found initially (line 122)
        .mockResolvedValueOnce(createQueryResult([])) // Check for existing account for user lookup (line 135)
        .mockResolvedValueOnce(createQueryResult([])) // validateAccountTypeConsistency - no existing account (line 13)
        .mockResolvedValueOnce(createQueryResult([{ id: 1, user_id: 'user123', provider: 'whatsapp' }])) // Account created (line 197)
        .mockResolvedValueOnce(createQueryResult([])) // No chat found (line 214)
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // Chat created (line 229)
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // Message stored (line 288)
        .mockResolvedValueOnce(createQueryResult([])) // Chat updated (line 303)
        .mockResolvedValueOnce(createQueryResult([{ user_id: 'user123' }])) // Get user ID for usage (line 309)
        .mockResolvedValueOnce(createQueryResult([])) // Update usage (line 311)
        .mockResolvedValueOnce(createQueryResult([{ user_id: 'user123' }])); // Get user ID for socket emit (line 320)

      await handleUniPileMessage(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ received: true });
    });

    it('should skip outgoing messages', async () => {
      mockReq.body = {
        account_id: 'acc123',
        message_id: 'msg123',
        text: 'Hello World',
        sender: {
          attendee_name: 'Me',
          attendee_provider_id: '919566651479@s.whatsapp.net',
        },
        timestamp: new Date().toISOString(),
      };

      // Mock database queries - account exists, chat doesn't exist, so it will be created
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([{ id: 1, user_id: 'user123', provider: 'whatsapp' }])) // Account found
        .mockResolvedValueOnce(createQueryResult([])) // No chat found
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])); // Chat created (but we'll skip before storing message)

      // Mock getUserWhatsAppPhone to return the same phone number (making it outgoing)
      (getUserWhatsAppPhone as jest.Mock).mockResolvedValueOnce('919566651479@s.whatsapp.net');

      await handleUniPileMessage(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ received: true, skipped: 'outgoing message' });
    });

    it('should handle database errors gracefully', async () => {
      mockReq.body = {
        account_id: 'acc123',
        message_id: 'msg123',
        text: 'Hello World',
      };

      (pool.query as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      await handleUniPileMessage(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('handleUniPileAccountStatus', () => {
    it('should handle account status update', async () => {
      mockReq.body = {
        event: 'account.update',
        data: {
          account_id: 'acc123',
          status: 'connected',
        },
      };

      // Mock database queries
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // Account found
        .mockResolvedValueOnce(createQueryResult([])); // Account updated

      await handleUniPileAccountStatus(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
    });

    it('should create account if not exists', async () => {
      mockReq.body = {
        event: 'account.update',
        data: {
          account_id: 'acc123',
          status: 'connected',
        },
      };

      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([])) // Account not found
        .mockResolvedValueOnce(createQueryResult([{ id: 1 }])) // Account created
        .mockResolvedValueOnce(createQueryResult([])); // Update

      await handleUniPileAccountStatus(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      mockReq.body = {
        event: 'account.update',
        data: {
          account_id: 'acc123',
          status: 'connected',
        },
      };

      (pool.query as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      await handleUniPileAccountStatus(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });
});
