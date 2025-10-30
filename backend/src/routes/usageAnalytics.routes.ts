import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getMonthlyUsage,
  getProviderUsage,
  getUsageTrends,
  generateUsageReport,
  getCurrentUsage,
  getAdminUsageStats,
  trackEvent,
  getEventAnalytics,
  getSessionAnalytics,
  getAdminAnalytics
} from '../controllers/usageAnalytics.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route GET /api/usage/monthly
 * @desc Get monthly usage for all providers
 * @query month - Optional month in YYYY-MM format (defaults to current month)
 */
router.get('/monthly', getMonthlyUsage);

/**
 * @route GET /api/usage/current
 * @desc Get current usage summary for dashboard
 */
router.get('/current', getCurrentUsage);

/**
 * @route GET /api/usage/provider/:provider
 * @desc Get usage for a specific provider
 * @param provider - Provider name (whatsapp, instagram, email, outlook)
 * @query months - Number of months to include (default: 1)
 */
router.get('/provider/:provider', getProviderUsage);

/**
 * @route GET /api/usage/trends
 * @desc Get usage trends over time
 * @query months - Number of months to include (default: 6)
 */
router.get('/trends', getUsageTrends);

/**
 * @route GET /api/usage/report
 * @desc Generate comprehensive usage report
 * @query month - Optional month in YYYY-MM format (defaults to current month)
 */
router.get('/report', generateUsageReport);

/**
 * @route GET /api/usage/admin/stats
 * @desc Get admin usage statistics (requires admin role)
 * @query months - Number of months to include (default: 1)
 */
router.get('/admin/stats', getAdminUsageStats);

/**
 * @route POST /api/usage/events/track
 * @desc Track a user event
 * @body eventType, eventCategory, properties
 */
router.post('/events/track', trackEvent);

/**
 * @route GET /api/usage/events/analytics
 * @desc Get event analytics for user
 * @query days - Number of days to include (default: 30)
 */
router.get('/events/analytics', getEventAnalytics);

/**
 * @route GET /api/usage/sessions/analytics
 * @desc Get session analytics for user
 * @query days - Number of days to include (default: 30)
 */
router.get('/sessions/analytics', getSessionAnalytics);

/**
 * @route GET /api/usage/admin/analytics
 * @desc Get admin analytics (all users)
 * @query days - Number of days to include (default: 30)
 */
router.get('/admin/analytics', getAdminAnalytics);

export default router;
