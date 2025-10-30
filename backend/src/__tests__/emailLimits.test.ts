import { EmailLimitsService } from '../services/emailLimits.service';
import {
  createQueryResult,
} from './helpers';

// Mock pg module with a shared mock query function
const mockQueryFn = jest.fn();
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: (...args: any[]) => mockQueryFn(...args),
  })),
}));

describe('Email Limits Service', () => {
  const testUserId = 'user123';
  const testMailboxId = 'mailbox123';
  const testNow = new Date('2024-01-15T10:00:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
    // Set default environment variables for tests
    process.env.EMAIL_MAX_RECIPIENTS_PER_MESSAGE = '10';
    process.env.EMAIL_MAX_PER_HOUR = '50';
    process.env.EMAIL_MAX_PER_DAY = '200';
    process.env.EMAIL_PER_RECIPIENT_COOLDOWN_SEC = '120';
    process.env.EMAIL_PER_DOMAIN_COOLDOWN_SEC = '60';
    process.env.EMAIL_MAX_ATTACHMENT_BYTES = '10485760'; // 10MB
    process.env.EMAIL_TRIAL_DAILY_CAP = '20';
  });

  describe('Basic Guards', () => {
    it('should reject emails with no recipients', async () => {
      await expect(
        EmailLimitsService.enforceLimits({
          userId: testUserId,
          mailboxId: testMailboxId,
          to: [],
          domains: [],
          isReply: false,
          attachmentBytes: 0,
          now: testNow,
        })
      ).rejects.toThrow('No recipients specified');
    });

    it('should reject emails exceeding recipient count limit', async () => {
      const tooManyRecipients = Array(11).fill('recipient@example.com');

      await expect(
        EmailLimitsService.enforceLimits({
          userId: testUserId,
          mailboxId: testMailboxId,
          to: tooManyRecipients,
          domains: ['example.com'],
          isReply: false,
          attachmentBytes: 0,
          now: testNow,
        })
      ).rejects.toThrow('Max 10 recipients per email');
    });

    it('should allow emails within recipient count limit', async () => {
      const validRecipients = Array(10).fill('recipient@example.com');

      // Mock all database queries
      mockQueryFn
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Hourly limit - not exceeded
        .mockResolvedValueOnce(createQueryResult([{ is_trial: false }])) // Trial check
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Daily limit - not exceeded
        .mockResolvedValueOnce(createQueryResult([])) // Recipient cooldown check
        .mockResolvedValueOnce(createQueryResult([])); // Domain pacing check

      await expect(
        EmailLimitsService.enforceLimits({
          userId: testUserId,
          mailboxId: testMailboxId,
          to: validRecipients,
          domains: ['example.com'],
          isReply: false,
          attachmentBytes: 0,
          now: testNow,
        })
      ).resolves.not.toThrow();
    });

    it('should reject emails exceeding attachment size limit', async () => {
      const oversizedAttachment = 11 * 1024 * 1024; // 11MB

      await expect(
        EmailLimitsService.enforceLimits({
          userId: testUserId,
          mailboxId: testMailboxId,
          to: ['recipient@example.com'],
          domains: ['example.com'],
          isReply: false,
          attachmentBytes: oversizedAttachment,
          now: testNow,
        })
      ).rejects.toThrow('Attachments exceed');
    });

    it('should allow emails within attachment size limit', async () => {
      const validAttachment = 5 * 1024 * 1024; // 5MB

      // Mock all database queries
      mockQueryFn
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Hourly limit
        .mockResolvedValueOnce(createQueryResult([{ is_trial: false }])) // Trial check
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Daily limit
        .mockResolvedValueOnce(createQueryResult([])) // Recipient cooldown
        .mockResolvedValueOnce(createQueryResult([])); // Domain pacing

      await expect(
        EmailLimitsService.enforceLimits({
          userId: testUserId,
          mailboxId: testMailboxId,
          to: ['recipient@example.com'],
          domains: ['example.com'],
          isReply: false,
          attachmentBytes: validAttachment,
          now: testNow,
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Hourly Limit Enforcement', () => {
    it('should allow emails within hourly limit', async () => {
      mockQueryFn
        .mockResolvedValueOnce(createQueryResult([{ count: 25 }])) // Hourly count: 25/50
        .mockResolvedValueOnce(createQueryResult([{ is_trial: false }])) // Trial check
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Daily limit
        .mockResolvedValueOnce(createQueryResult([])) // Recipient cooldown
        .mockResolvedValueOnce(createQueryResult([])); // Domain pacing

      await expect(
        EmailLimitsService.enforceLimits({
          userId: testUserId,
          mailboxId: testMailboxId,
          to: ['recipient@example.com'],
          domains: ['example.com'],
          isReply: false,
          attachmentBytes: 0,
          now: testNow,
        })
      ).resolves.not.toThrow();
    });

    it('should reject emails exceeding hourly limit', async () => {
      mockQueryFn
        .mockResolvedValueOnce(createQueryResult([{ count: 51 }])); // Hourly count: 51/50

      await expect(
        EmailLimitsService.enforceLimits({
          userId: testUserId,
          mailboxId: testMailboxId,
          to: ['recipient@example.com'],
          domains: ['example.com'],
          isReply: false,
          attachmentBytes: 0,
          now: testNow,
        })
      ).rejects.toThrow('Hourly send limit reached');
    });

    it('should include correct error code for hourly limit', async () => {
      mockQueryFn
        .mockResolvedValueOnce(createQueryResult([{ count: 51 }]));

      try {
        await EmailLimitsService.enforceLimits({
          userId: testUserId,
          mailboxId: testMailboxId,
          to: ['recipient@example.com'],
          domains: ['example.com'],
          isReply: false,
          attachmentBytes: 0,
          now: testNow,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('HOURLY_CAP');
        expect(error.status).toBe(402);
      }
    });
  });

  describe('Daily Limit Enforcement', () => {
    it('should allow emails within daily limit for regular users', async () => {
      mockQueryFn
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Hourly limit
        .mockResolvedValueOnce(createQueryResult([{ is_trial: false }])) // Trial check
        .mockResolvedValueOnce(createQueryResult([{ count: 150 }])) // Daily count: 150/200
        .mockResolvedValueOnce(createQueryResult([])) // Recipient cooldown
        .mockResolvedValueOnce(createQueryResult([])); // Domain pacing

      await expect(
        EmailLimitsService.enforceLimits({
          userId: testUserId,
          mailboxId: testMailboxId,
          to: ['recipient@example.com'],
          domains: ['example.com'],
          isReply: false,
          attachmentBytes: 0,
          now: testNow,
        })
      ).resolves.not.toThrow();
    });

    it('should reject emails exceeding daily limit for regular users', async () => {
      mockQueryFn
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Hourly limit
        .mockResolvedValueOnce(createQueryResult([{ is_trial: false }])) // Trial check
        .mockResolvedValueOnce(createQueryResult([{ count: 201 }])); // Daily count: 201/200

      await expect(
        EmailLimitsService.enforceLimits({
          userId: testUserId,
          mailboxId: testMailboxId,
          to: ['recipient@example.com'],
          domains: ['example.com'],
          isReply: false,
          attachmentBytes: 0,
          now: testNow,
        })
      ).rejects.toThrow('Daily send limit reached');
    });

    it('should apply trial daily cap for trial users', async () => {
      mockQueryFn
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Hourly limit
        .mockResolvedValueOnce(createQueryResult([{ is_trial: true }])) // Trial check
        .mockResolvedValueOnce(createQueryResult([{ count: 21 }])); // Daily count: 21/20 (trial cap)

      await expect(
        EmailLimitsService.enforceLimits({
          userId: testUserId,
          mailboxId: testMailboxId,
          to: ['recipient@example.com'],
          domains: ['example.com'],
          isReply: false,
          attachmentBytes: 0,
          now: testNow,
        })
      ).rejects.toThrow('Daily send limit reached (20)');
    });

    it('should include correct error code for daily limit', async () => {
      mockQueryFn
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Hourly limit
        .mockResolvedValueOnce(createQueryResult([{ is_trial: false }])) // Trial check
        .mockResolvedValueOnce(createQueryResult([{ count: 201 }])); // Daily limit exceeded

      try {
        await EmailLimitsService.enforceLimits({
          userId: testUserId,
          mailboxId: testMailboxId,
          to: ['recipient@example.com'],
          domains: ['example.com'],
          isReply: false,
          attachmentBytes: 0,
          now: testNow,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('DAILY_CAP');
        expect(error.status).toBe(402);
      }
    });
  });

  describe('Recipient Cooldown', () => {
    it('should allow emails to recipients not in cooldown', async () => {
      mockQueryFn
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Hourly limit
        .mockResolvedValueOnce(createQueryResult([{ is_trial: false }])) // Trial check
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Daily limit
        .mockResolvedValueOnce(createQueryResult([])) // Recipient cooldown - no previous send
        .mockResolvedValueOnce(createQueryResult([])); // Domain pacing

      await expect(
        EmailLimitsService.enforceLimits({
          userId: testUserId,
          mailboxId: testMailboxId,
          to: ['recipient@example.com'],
          domains: ['example.com'],
          isReply: false,
          attachmentBytes: 0,
          now: testNow,
        })
      ).resolves.not.toThrow();
    });

    it('should reject emails sent too soon after cooldown', async () => {
      const recentTime = new Date(testNow.getTime() - 60 * 1000); // 60 seconds ago (within 120s cooldown)

      mockQueryFn
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Hourly limit
        .mockResolvedValueOnce(createQueryResult([{ is_trial: false }])) // Trial check
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Daily limit
        .mockResolvedValueOnce(createQueryResult([{ value: recentTime.toISOString() }])); // Recipient cooldown

      await expect(
        EmailLimitsService.enforceLimits({
          userId: testUserId,
          mailboxId: testMailboxId,
          to: ['recipient@example.com'],
          domains: ['example.com'],
          isReply: false,
          attachmentBytes: 0,
          now: testNow,
        })
      ).rejects.toThrow('Wait');
    });

    it('should allow emails after cooldown period expires', async () => {
      const oldTime = new Date(testNow.getTime() - 130 * 1000); // 130 seconds ago (past 120s cooldown)

      mockQueryFn
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Hourly limit
        .mockResolvedValueOnce(createQueryResult([{ is_trial: false }])) // Trial check
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Daily limit
        .mockResolvedValueOnce(createQueryResult([{ value: oldTime.toISOString() }])) // Recipient cooldown expired
        .mockResolvedValueOnce(createQueryResult([])); // Domain pacing

      await expect(
        EmailLimitsService.enforceLimits({
          userId: testUserId,
          mailboxId: testMailboxId,
          to: ['recipient@example.com'],
          domains: ['example.com'],
          isReply: false,
          attachmentBytes: 0,
          now: testNow,
        })
      ).resolves.not.toThrow();
    });

    it('should skip recipient cooldown for replies', async () => {
      const recentTime = new Date(testNow.getTime() - 60 * 1000); // 60 seconds ago

      mockQueryFn
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Hourly limit
        .mockResolvedValueOnce(createQueryResult([{ is_trial: false }])) // Trial check
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Daily limit
        // Recipient cooldown check skipped for replies
        .mockResolvedValueOnce(createQueryResult([])); // Domain pacing

      await expect(
        EmailLimitsService.enforceLimits({
          userId: testUserId,
          mailboxId: testMailboxId,
          to: ['recipient@example.com'],
          domains: ['example.com'],
          isReply: true, // Reply, so cooldown should be skipped
          attachmentBytes: 0,
          now: testNow,
        })
      ).resolves.not.toThrow();
    });

    it('should include correct error code for recipient cooldown', async () => {
      const recentTime = new Date(testNow.getTime() - 60 * 1000);

      mockQueryFn
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Hourly limit
        .mockResolvedValueOnce(createQueryResult([{ is_trial: false }])) // Trial check
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Daily limit
        .mockResolvedValueOnce(createQueryResult([{ value: recentTime.toISOString() }])); // Recipient cooldown

      try {
        await EmailLimitsService.enforceLimits({
          userId: testUserId,
          mailboxId: testMailboxId,
          to: ['recipient@example.com'],
          domains: ['example.com'],
          isReply: false,
          attachmentBytes: 0,
          now: testNow,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('RECIPIENT_COOLDOWN');
        expect(error.status).toBe(402);
      }
    });
  });

  describe('Domain Pacing', () => {
    it('should allow emails to domains not in cooldown', async () => {
      mockQueryFn
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Hourly limit
        .mockResolvedValueOnce(createQueryResult([{ is_trial: false }])) // Trial check
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Daily limit
        .mockResolvedValueOnce(createQueryResult([])) // Recipient cooldown
        .mockResolvedValueOnce(createQueryResult([])); // Domain pacing - no previous send

      await expect(
        EmailLimitsService.enforceLimits({
          userId: testUserId,
          mailboxId: testMailboxId,
          to: ['recipient@example.com'],
          domains: ['example.com'],
          isReply: false,
          attachmentBytes: 0,
          now: testNow,
        })
      ).resolves.not.toThrow();
    });

    it('should reject emails sent too soon to same domain', async () => {
      const recentTime = new Date(testNow.getTime() - 30 * 1000); // 30 seconds ago (within 60s cooldown)

      mockQueryFn
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Hourly limit
        .mockResolvedValueOnce(createQueryResult([{ is_trial: false }])) // Trial check
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Daily limit
        .mockResolvedValueOnce(createQueryResult([])) // Recipient cooldown
        .mockResolvedValueOnce(createQueryResult([{ value: recentTime.toISOString() }])); // Domain pacing

      await expect(
        EmailLimitsService.enforceLimits({
          userId: testUserId,
          mailboxId: testMailboxId,
          to: ['recipient@example.com'],
          domains: ['example.com'],
          isReply: false,
          attachmentBytes: 0,
          now: testNow,
        })
      ).rejects.toThrow('Slow down');
    });

    it('should allow emails after domain cooldown expires', async () => {
      const oldTime = new Date(testNow.getTime() - 70 * 1000); // 70 seconds ago (past 60s cooldown)

      mockQueryFn
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Hourly limit
        .mockResolvedValueOnce(createQueryResult([{ is_trial: false }])) // Trial check
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Daily limit
        .mockResolvedValueOnce(createQueryResult([])) // Recipient cooldown
        .mockResolvedValueOnce(createQueryResult([{ value: oldTime.toISOString() }])); // Domain pacing expired

      await expect(
        EmailLimitsService.enforceLimits({
          userId: testUserId,
          mailboxId: testMailboxId,
          to: ['recipient@example.com'],
          domains: ['example.com'],
          isReply: false,
          attachmentBytes: 0,
          now: testNow,
        })
      ).resolves.not.toThrow();
    });

    it('should include correct error code for domain pacing', async () => {
      const recentTime = new Date(testNow.getTime() - 30 * 1000);

      mockQueryFn
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Hourly limit
        .mockResolvedValueOnce(createQueryResult([{ is_trial: false }])) // Trial check
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Daily limit
        .mockResolvedValueOnce(createQueryResult([])) // Recipient cooldown
        .mockResolvedValueOnce(createQueryResult([{ value: recentTime.toISOString() }])); // Domain pacing

      try {
        await EmailLimitsService.enforceLimits({
          userId: testUserId,
          mailboxId: testMailboxId,
          to: ['recipient@example.com'],
          domains: ['example.com'],
          isReply: false,
          attachmentBytes: 0,
          now: testNow,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.code).toBe('DOMAIN_COOLDOWN');
        expect(error.status).toBe(402);
      }
    });
  });

  describe('Multiple Recipients and Domains', () => {
    it('should check cooldown for all recipients', async () => {
      const recentTime = new Date(testNow.getTime() - 60 * 1000);

      mockQueryFn
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Hourly limit
        .mockResolvedValueOnce(createQueryResult([{ is_trial: false }])) // Trial check
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Daily limit
        .mockResolvedValueOnce(createQueryResult([{ value: recentTime.toISOString() }])) // First recipient in cooldown
        .mockResolvedValueOnce(createQueryResult([])); // Domain pacing

      await expect(
        EmailLimitsService.enforceLimits({
          userId: testUserId,
          mailboxId: testMailboxId,
          to: ['recipient1@example.com', 'recipient2@example.com'],
          domains: ['example.com'],
          isReply: false,
          attachmentBytes: 0,
          now: testNow,
        })
      ).rejects.toThrow('Wait');
    });

    it('should check pacing for all domains', async () => {
      const recentTime = new Date(testNow.getTime() - 30 * 1000);

      mockQueryFn
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Hourly limit
        .mockResolvedValueOnce(createQueryResult([{ is_trial: false }])) // Trial check
        .mockResolvedValueOnce(createQueryResult([{ count: 0 }])) // Daily limit
        .mockResolvedValueOnce(createQueryResult([])) // Recipient 1 cooldown
        .mockResolvedValueOnce(createQueryResult([])) // Recipient 2 cooldown
        .mockResolvedValueOnce(createQueryResult([{ value: recentTime.toISOString() }])); // Domain pacing

      await expect(
        EmailLimitsService.enforceLimits({
          userId: testUserId,
          mailboxId: testMailboxId,
          to: ['recipient1@example.com', 'recipient2@other.com'],
          domains: ['example.com', 'other.com'],
          isReply: false,
          attachmentBytes: 0,
          now: testNow,
        })
      ).rejects.toThrow('Slow down');
    });
  });

  describe('getUsageStats', () => {
    it('should return correct usage statistics', async () => {
      mockQueryFn
        .mockResolvedValueOnce(createQueryResult([{ count: 25 }])) // Hourly count
        .mockResolvedValueOnce(createQueryResult([{ count: 100 }])) // Daily count
        .mockResolvedValueOnce(createQueryResult([{ is_trial: false }])); // Trial check

      const stats = await EmailLimitsService.getUsageStats(testMailboxId, testNow);

      expect(stats.perHour).toBe(50);
      expect(stats.usedHour).toBe(25);
      expect(stats.perDay).toBe(200);
      expect(stats.usedDay).toBe(100);
      expect(stats.cooldowns.recipientSec).toBe(120);
      expect(stats.cooldowns.domainSec).toBe(60);
    });

    it('should apply trial cap for trial mailboxes', async () => {
      mockQueryFn
        .mockResolvedValueOnce(createQueryResult([{ count: 10 }])) // Hourly count
        .mockResolvedValueOnce(createQueryResult([{ count: 15 }])) // Daily count
        .mockResolvedValueOnce(createQueryResult([{ is_trial: true }])); // Trial check

      const stats = await EmailLimitsService.getUsageStats(testMailboxId, testNow);

      expect(stats.perDay).toBe(20); // Trial cap
    });
  });

  describe('updateCooldowns', () => {
    it('should update recipient cooldowns', async () => {
      const recipients = ['recipient1@example.com', 'recipient2@example.com'];
      const domains = ['example.com'];

      // Mock setLastSentTime calls (2 recipients + 1 domain = 3 calls)
      mockQueryFn
        .mockResolvedValueOnce(createQueryResult([])) // Recipient 1
        .mockResolvedValueOnce(createQueryResult([])) // Recipient 2
        .mockResolvedValueOnce(createQueryResult([])); // Domain

      await EmailLimitsService.updateCooldowns(testMailboxId, recipients, domains, testNow);

      expect(mockQueryFn).toHaveBeenCalledTimes(3);
    });
  });
});
