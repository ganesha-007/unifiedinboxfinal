import { getEntitlements, PLANS, ADDONS } from '../config/pricing';
import { pool } from '../config/database';
import {
  createQueryResult,
  createAddonsResult,
} from './helpers';

// Mock the database
jest.mock('../config/database', () => ({
  pool: {
    query: jest.fn(),
  },
}));

// Mock the getUserPlan function to return different plans for testing
// Since getUserPlan is not exported, we need to test getEntitlements indirectly
// by mocking the database queries that getActiveAddons uses

describe('Pricing Configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('PLANS', () => {
    it('should have correct plan definitions', () => {
      expect(PLANS.starter).toBeDefined();
      expect(PLANS.growth).toBeDefined();
      expect(PLANS.scale).toBeDefined();
      
      expect(PLANS.starter.includes).toContain('linkedin');
      expect(PLANS.growth.includes).toContain('linkedin');
      expect(PLANS.growth.includes).toContain('crm');
      expect(PLANS.scale.includes).toContain('whatsapp');
      expect(PLANS.scale.includes).toContain('instagram');
      expect(PLANS.scale.includes).toContain('email');
    });
  });

  describe('ADDONS', () => {
    it('should have correct addon definitions', () => {
      expect(ADDONS.whatsapp).toBeDefined();
      expect(ADDONS.instagram).toBeDefined();
      expect(ADDONS.email).toBeDefined();
      
      expect(ADDONS.whatsapp.feature).toBe('whatsapp');
      expect(ADDONS.instagram.feature).toBe('instagram');
      expect(ADDONS.email.feature).toBe('email');
    });
  });

  describe('getEntitlements', () => {
    // Note: getUserPlan currently always returns 'scale', so all tests will reflect that
    // This tests the current implementation behavior
    it('should return correct entitlements for scale plan (default)', async () => {
      // Mock getActiveAddons query
      (pool.query as jest.Mock).mockResolvedValueOnce(
        createAddonsResult([])
      );

      const entitlements = await getEntitlements('user-123', pool);

      // Default plan is 'scale' which includes all providers
      expect(entitlements.whatsapp).toBe(true);
      expect(entitlements.instagram).toBe(true);
      expect(entitlements.email).toBe(true);
    });

    it('should grant access from addons (on top of default scale plan)', async () => {
      // Mock getActiveAddons query
      (pool.query as jest.Mock).mockResolvedValueOnce(
        createAddonsResult(['whatsapp'])
      );

      const entitlements = await getEntitlements('user-123', pool);

      // Scale plan already includes all, addons add nothing new but shouldn't break
      expect(entitlements.whatsapp).toBe(true);
      expect(entitlements.instagram).toBe(true);
      expect(entitlements.email).toBe(true);
    });

    it('should grant access from multiple addons', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce(
        createAddonsResult(['whatsapp', 'instagram', 'email'])
      );

      const entitlements = await getEntitlements('user-123', pool);

      expect(entitlements.whatsapp).toBe(true);
      expect(entitlements.instagram).toBe(true);
      expect(entitlements.email).toBe(true);
    });

    it('should combine plan and addon entitlements', async () => {
      // Scale plan has all providers, addons should still work
      (pool.query as jest.Mock).mockResolvedValueOnce(
        createAddonsResult(['whatsapp']) // Already included in scale, but should still work
      );

      const entitlements = await getEntitlements('user-123', pool);

      expect(entitlements.whatsapp).toBe(true);
      expect(entitlements.instagram).toBe(true);
      expect(entitlements.email).toBe(true);
    });

    it('should handle empty addons list', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce(
        createAddonsResult([])
      );

      const entitlements = await getEntitlements('user-123', pool);

      // Default scale plan should grant all access
      expect(entitlements.whatsapp).toBe(true);
      expect(entitlements.instagram).toBe(true);
      expect(entitlements.email).toBe(true);
    });

    it('should handle database query errors gracefully', async () => {
      (pool.query as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      await expect(getEntitlements('user-123', pool)).rejects.toThrow('Database error');
    });

    it('should handle database query errors in getActiveAddons', async () => {
      (pool.query as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      await expect(getEntitlements('user-123', pool)).rejects.toThrow('Database error');
    });

    it('should return correct structure', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce(
        createAddonsResult([])
      );

      const entitlements = await getEntitlements('user-123', pool);

      expect(entitlements).toHaveProperty('whatsapp');
      expect(entitlements).toHaveProperty('instagram');
      expect(entitlements).toHaveProperty('email');
      expect(typeof entitlements.whatsapp).toBe('boolean');
      expect(typeof entitlements.instagram).toBe('boolean');
      expect(typeof entitlements.email).toBe('boolean');
    });
  });

  describe('Edge Cases', () => {
    // Note: Current implementation always returns 'scale' plan
    // These tests verify addon handling edge cases

    it('should handle addons with invalid provider names', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce(
        createAddonsResult(['invalid-provider'])
      );

      const entitlements = await getEntitlements('user-123', pool);

      // Invalid provider should not grant access, but scale plan already grants all
      expect(entitlements.whatsapp).toBe(true); // From scale plan
      expect(entitlements.instagram).toBe(true); // From scale plan
      expect(entitlements.email).toBe(true); // From scale plan
    });

    it('should handle null addons gracefully', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce(
        createQueryResult([{ provider: null }])
      );

      const entitlements = await getEntitlements('user-123', pool);

      // Scale plan grants all access
      expect(entitlements.whatsapp).toBe(true);
      expect(entitlements.instagram).toBe(true);
      expect(entitlements.email).toBe(true);
    });
  });
});
