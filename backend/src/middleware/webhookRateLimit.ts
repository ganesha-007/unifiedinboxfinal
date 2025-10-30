import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Webhook Rate Limiting Configuration
 */
const WEBHOOK_RATE_LIMITS = {
  // UniPile webhooks - more lenient as they come from trusted service
  UNIPILE_MESSAGE: {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: 'Too many UniPile message webhook requests, please try again later.'
  },
  UNIPILE_ACCOUNT: {
    windowMs: 60 * 1000, // 1 minute
    max: 50, // 50 requests per minute
    message: 'Too many UniPile account status webhook requests, please try again later.'
  },
  // Gmail webhooks - more lenient as they come from Google Pub/Sub
  GMAIL: {
    windowMs: 60 * 1000, // 1 minute
    max: 200, // 200 requests per minute (Pub/Sub can send many)
    message: 'Too many Gmail webhook requests, please try again later.'
  },
  // General webhook endpoint protection
  GENERAL: {
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
    message: 'Too many webhook requests, please try again later.'
  }
};

/**
 * Get client IP address from request
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded 
    ? (typeof forwarded === 'string' ? forwarded.split(',')[0] : forwarded[0])
    : req.socket.remoteAddress || 'unknown';
  return ip.trim();
}

/**
 * Rate limiter configuration with custom handler
 */
function createWebhookRateLimiter(config: typeof WEBHOOK_RATE_LIMITS.UNIPILE_MESSAGE) {
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    message: {
      error: 'Rate limit exceeded',
      message: config.message,
      retryAfter: Math.ceil(config.windowMs / 1000)
    },
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    skip: (req: Request) => {
      // Skip rate limiting in development/test mode if specified
      return process.env.NODE_ENV === 'test';
    },
    keyGenerator: (req: Request) => {
      // Use IP address as key, but also include webhook type for better tracking
      const ip = getClientIp(req);
      const webhookType = req.path.includes('/unipile/messages') ? 'unipile-message' :
                         req.path.includes('/unipile/account-status') ? 'unipile-account' :
                         req.path.includes('/gmail') ? 'gmail' : 'general';
      return `${ip}:${webhookType}`;
    },
    handler: (req: Request, res: Response) => {
      const ip = getClientIp(req);
      console.warn(`⚠️ Rate limit exceeded for IP: ${ip}, Path: ${req.path}`);
      res.status(429).json({
        error: 'Rate limit exceeded',
        message: config.message,
        retryAfter: Math.ceil(config.windowMs / 1000),
        limit: config.max,
        windowMs: config.windowMs
      });
    }
  });
}

/**
 * UniPile message webhook rate limiter
 */
export const unipileMessageRateLimiter = createWebhookRateLimiter(WEBHOOK_RATE_LIMITS.UNIPILE_MESSAGE);

/**
 * UniPile account status webhook rate limiter
 */
export const unipileAccountRateLimiter = createWebhookRateLimiter(WEBHOOK_RATE_LIMITS.UNIPILE_ACCOUNT);

/**
 * Gmail webhook rate limiter
 */
export const gmailWebhookRateLimiter = createWebhookRateLimiter(WEBHOOK_RATE_LIMITS.GMAIL);

/**
 * General webhook rate limiter (for unknown endpoints)
 */
export const generalWebhookRateLimiter = createWebhookRateLimiter(WEBHOOK_RATE_LIMITS.GENERAL);

/**
 * Rate limiting middleware with detailed logging
 */
export function webhookRateLimiter(req: Request, res: Response, next: any) {
  const ip = getClientIp(req);
  const path = req.path;
  
  console.log(`🔒 Rate limiting check for IP: ${ip}, Path: ${path}`);
  
  // Determine which rate limiter to use based on path
  if (path.includes('/unipile/messages')) {
    return unipileMessageRateLimiter(req, res, next);
  } else if (path.includes('/unipile/account-status')) {
    return unipileAccountRateLimiter(req, res, next);
  } else if (path.includes('/gmail')) {
    return gmailWebhookRateLimiter(req, res, next);
  } else {
    return generalWebhookRateLimiter(req, res, next);
  }
}

