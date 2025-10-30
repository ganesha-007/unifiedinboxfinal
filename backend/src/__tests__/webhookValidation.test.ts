import { validateWebhookPayload, validateWebhookPayloadWithLogging } from '../middleware/webhookValidation';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from './helpers';

// Mock the webhook schemas
jest.mock('../schemas/webhookSchemas', () => ({
  validateWebhookPayload: jest.fn(),
}));

import { validateWebhookPayload as validatePayload } from '../schemas/webhookSchemas';

describe('Webhook Payload Validation', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(() => {
    mockReq = createMockRequest();
    mockRes = createMockResponse();
    mockNext = createMockNext();
    jest.clearAllMocks();
  });

  describe('validateWebhookPayload', () => {
    it('should validate UniPile message webhook', async () => {
      mockReq.path = '/api/webhooks/unipile/messages';
      mockReq.body = {
        account_id: 'acc123',
        message_id: 'msg123',
        text: 'Hello',
        from: { name: 'John', phone: '123456789' },
      };

      (validatePayload as jest.Mock).mockReturnValue({
        isValid: true,
        sanitizedPayload: mockReq.body,
      });

      await validateWebhookPayload(mockReq, mockRes, mockNext);

      expect(validatePayload).toHaveBeenCalledWith(mockReq.body, 'unipile-message');
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should validate UniPile account status webhook', async () => {
      mockReq.path = '/api/webhooks/unipile/account-status';
      mockReq.body = {
        event: 'account.update',
        data: {
          account_id: 'acc123',
          status: 'connected',
        },
      };

      (validatePayload as jest.Mock).mockReturnValue({
        isValid: true,
        sanitizedPayload: mockReq.body,
      });

      await validateWebhookPayload(mockReq, mockRes, mockNext);

      expect(validatePayload).toHaveBeenCalledWith(mockReq.body, 'unipile-account');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should validate Gmail webhook', async () => {
      mockReq.path = '/api/webhooks/gmail/messages';
      mockReq.body = {
        message: {
          data: Buffer.from('test').toString('base64'),
          messageId: 'msg123',
          publishTime: new Date().toISOString(),
        },
      };

      (validatePayload as jest.Mock).mockReturnValue({
        isValid: true,
        sanitizedPayload: mockReq.body,
      });

      await validateWebhookPayload(mockReq, mockRes, mockNext);

      expect(validatePayload).toHaveBeenCalledWith(mockReq.body, 'gmail');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid payload', async () => {
      mockReq.path = '/api/webhooks/unipile/messages';
      mockReq.body = { invalid: 'payload' };

      (validatePayload as jest.Mock).mockReturnValue({
        isValid: false,
        error: 'Missing required field: account_id',
      });

      await validateWebhookPayload(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid webhook payload',
        message: 'Missing required field: account_id',
        details: 'The webhook payload does not match the expected schema',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should sanitize payload when validation succeeds', async () => {
      mockReq.path = '/api/webhooks/unipile/messages';
      const originalPayload = { account_id: 'acc123', extra: 'data' };
      const sanitizedPayload = { account_id: 'acc123' };
      mockReq.body = originalPayload;

      (validatePayload as jest.Mock).mockReturnValue({
        isValid: true,
        sanitizedPayload: sanitizedPayload,
      });

      await validateWebhookPayload(mockReq, mockRes, mockNext);

      expect(mockReq.body).toEqual(sanitizedPayload);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle unknown webhook type as challenge', async () => {
      mockReq.path = '/api/webhooks/unknown';
      mockReq.body = { challenge: 'test123' };

      (validatePayload as jest.Mock).mockReturnValue({
        isValid: true,
        sanitizedPayload: mockReq.body,
      });

      await validateWebhookPayload(mockReq, mockRes, mockNext);

      expect(validatePayload).toHaveBeenCalledWith(mockReq.body, 'challenge');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle validation errors gracefully', async () => {
      mockReq.path = '/api/webhooks/unipile/messages';
      mockReq.body = {};

      (validatePayload as jest.Mock).mockImplementation(() => {
        throw new Error('Validation error');
      });

      await validateWebhookPayload(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Failed to validate webhook payload',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validateWebhookPayloadWithLogging', () => {
    it('should log payload details', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockReq.path = '/api/webhooks/unipile/messages';
      mockReq.body = { account_id: 'acc123', message_id: 'msg123' };

      (validatePayload as jest.Mock).mockReturnValue({
        isValid: true,
        sanitizedPayload: mockReq.body,
      });

      await validateWebhookPayloadWithLogging(mockReq, mockRes, mockNext);

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should log validation errors', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockReq.path = '/api/webhooks/unipile/messages';
      mockReq.body = { invalid: 'payload' };

      (validatePayload as jest.Mock).mockReturnValue({
        isValid: false,
        error: 'Validation failed',
      });

      await validateWebhookPayloadWithLogging(mockReq, mockRes, mockNext);

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
      
      consoleSpy.mockRestore();
    });

    it('should include received payload in error response', async () => {
      mockReq.path = '/api/webhooks/unipile/messages';
      const invalidPayload = { invalid: 'payload' };
      mockReq.body = invalidPayload;

      (validatePayload as jest.Mock).mockReturnValue({
        isValid: false,
        error: 'Validation failed',
      });

      await validateWebhookPayloadWithLogging(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          receivedPayload: invalidPayload,
        })
      );
    });
  });
});

