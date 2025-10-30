import { verifyWebhookSignature, generateWebhookSignature } from '../middleware/webhookAuth';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from './helpers';

// Mock environment variables
const originalEnv = process.env;

describe('Webhook Signature Verification', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(() => {
    mockReq = createMockRequest();
    mockRes = createMockResponse();
    mockNext = createMockNext();
    jest.clearAllMocks();
    
    // Set up default environment
    process.env.UNIPILE_WEBHOOK_SECRET = 'test_secret_key_123';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('verifyWebhookSignature', () => {
    it('should allow request when no secret is configured (development mode)', async () => {
      delete process.env.UNIPILE_WEBHOOK_SECRET;

      await verifyWebhookSignature(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should reject request when signature header is missing', async () => {
      mockReq.headers = {};

      await verifyWebhookSignature(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Missing webhook signature',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow request with valid signature', async () => {
      const payload = { event: 'message.new', data: { id: '123' } };
      mockReq.body = payload;
      const payloadString = JSON.stringify(payload);
      const signature = generateWebhookSignature(payloadString, 'test_secret_key_123');
      mockReq.headers = { 'x-unipile-signature': signature };

      await verifyWebhookSignature(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should reject request with invalid signature', async () => {
      const payload = { event: 'message.new', data: { id: '123' } };
      mockReq.body = payload;
      mockReq.headers = { 'x-unipile-signature': 'invalid_signature' };

      await verifyWebhookSignature(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid webhook signature',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with wrong secret', async () => {
      const payload = { event: 'message.new', data: { id: '123' } };
      mockReq.body = payload;
      const payloadString = JSON.stringify(payload);
      const signature = generateWebhookSignature(payloadString, 'wrong_secret');
      mockReq.headers = { 'x-unipile-signature': signature };

      await verifyWebhookSignature(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle signature length mismatch', async () => {
      const payload = { event: 'message.new', data: { id: '123' } };
      mockReq.body = payload;
      mockReq.headers = { 'x-unipile-signature': 'short' }; // Too short

      await verifyWebhookSignature(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      // Force an error by making JSON.stringify throw
      const originalStringify = JSON.stringify;
      JSON.stringify = jest.fn(() => {
        throw new Error('Stringify error');
      });

      mockReq.headers = { 'x-unipile-signature': 'signature' };

      await verifyWebhookSignature(mockReq, mockRes, mockNext);

      // Should handle error and return 500
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Failed to verify webhook signature',
      });

      // Restore JSON.stringify
      JSON.stringify = originalStringify;
    });
  });

  describe('generateWebhookSignature', () => {
    it('should generate consistent signatures', () => {
      const payload = 'test payload';
      const secret = 'test_secret';
      
      const sig1 = generateWebhookSignature(payload, secret);
      const sig2 = generateWebhookSignature(payload, secret);
      
      expect(sig1).toBe(sig2);
      expect(sig1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex string
    });

    it('should generate different signatures for different payloads', () => {
      const secret = 'test_secret';
      
      const sig1 = generateWebhookSignature('payload1', secret);
      const sig2 = generateWebhookSignature('payload2', secret);
      
      expect(sig1).not.toBe(sig2);
    });

    it('should generate different signatures for different secrets', () => {
      const payload = 'test payload';
      
      const sig1 = generateWebhookSignature(payload, 'secret1');
      const sig2 = generateWebhookSignature(payload, 'secret2');
      
      expect(sig1).not.toBe(sig2);
    });
  });
});
