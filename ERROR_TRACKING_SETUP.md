# Error Tracking Setup Guide

## Overview

Comprehensive error tracking system using Sentry with enhanced context, filtering, and production-ready configuration.

## Production Sentry Setup

### 1. Create Sentry Project

1. Go to [sentry.io](https://sentry.io) and create an account
2. Create a new project:
   - Platform: **Node.js** (for backend)
   - Platform: **React** (for frontend)
3. Copy the DSN from project settings

### 2. Environment Configuration

#### Backend (.env)
```env
# Sentry Configuration
SENTRY_DSN=https://your-dsn@sentry.io/project-id
SENTRY_TRACES_SAMPLE_RATE=0.1    # 10% of transactions
SENTRY_PROFILES_SAMPLE_RATE=0.1  # 10% of profiles
APP_VERSION=1.0.0                # Release version
APP_ENV=production               # Environment
```

#### Frontend (.env)
```env
# Sentry Configuration  
REACT_APP_SENTRY_DSN=https://your-frontend-dsn@sentry.io/project-id
REACT_APP_SENTRY_TRACES_SAMPLE_RATE=0.1
REACT_APP_VERSION=1.0.0
```

### 3. Sampling Configuration

#### Development
```env
SENTRY_TRACES_SAMPLE_RATE=1.0    # 100% for debugging
SENTRY_PROFILES_SAMPLE_RATE=1.0  # 100% for debugging
```

#### Staging
```env
SENTRY_TRACES_SAMPLE_RATE=0.5    # 50% for testing
SENTRY_PROFILES_SAMPLE_RATE=0.5  # 50% for testing
```

#### Production
```env
SENTRY_TRACES_SAMPLE_RATE=0.1    # 10% to reduce overhead
SENTRY_PROFILES_SAMPLE_RATE=0.05 # 5% for performance
```

## Error Categories

### 1. Filtered Errors (Not Sent to Sentry)
- Authentication errors (401, 403)
- Invalid token errors
- Chunk loading errors (frontend)
- Rate limiting (429) - logged but not alerted

### 2. Tracked Errors
- **Server Errors (5xx)**: All server-side errors
- **Database Errors**: Connection, query, constraint violations
- **API Errors**: External service failures (UniPile, Stripe, etc.)
- **Business Logic Errors**: Application-specific failures
- **Performance Issues**: Slow queries, timeouts

### 3. Error Context

Each error includes:
```json
{
  "user": {
    "id": "user_123",
    "email": "user@example.com"
  },
  "request": {
    "method": "POST",
    "url": "/api/channels/whatsapp/send",
    "userAgent": "Mozilla/5.0...",
    "ip": "192.168.1.1"
  },
  "extra": {
    "operation": "send_message",
    "provider": "whatsapp",
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

## Usage Examples

### 1. Controller Error Handling
```typescript
import { asyncErrorHandler, trackAPIError } from '../middleware/errorTracking';

export const sendMessage = asyncErrorHandler(async (req: Request, res: Response) => {
  try {
    const result = await unipileService.sendMessage(accountId, chatId, message);
    res.json(result);
  } catch (error) {
    trackAPIError(error, 'unipile_send_message', 'whatsapp');
    throw error; // Re-throw to trigger global handler
  }
});
```

### 2. Database Error Tracking
```typescript
import { trackDatabaseError } from '../middleware/errorTracking';

try {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
} catch (error) {
  trackDatabaseError(error, 'SELECT * FROM users WHERE id = $1', [userId]);
  throw error;
}
```

### 3. Business Logic Error Tracking
```typescript
import { trackBusinessError } from '../middleware/errorTracking';

if (!subscription.active) {
  const error = new Error('Subscription not active');
  trackBusinessError(error, 'check_subscription', userId);
  throw error;
}
```

### 4. Frontend Error Tracking
```typescript
import { captureError, setUserContext } from '../sentry';

// Set user context after login
setUserContext({
  id: user.id,
  email: user.email
});

// Track errors in components
try {
  await api.sendMessage(message);
} catch (error) {
  captureError(error, { component: 'MessageInput', action: 'send' });
  throw error;
}
```

## Sentry Dashboard Configuration

### 1. Alerts Setup

#### Critical Errors (Immediate)
- **Server Errors (5xx)**: > 5 errors in 5 minutes
- **Database Errors**: Any connection failures
- **Payment Errors**: Any Stripe webhook failures

#### Warning Alerts (15 minutes)
- **API Errors**: > 10 errors in 15 minutes
- **High Error Rate**: > 5% error rate
- **Performance Issues**: > 2s average response time

### 2. Custom Dashboards

#### Error Overview Dashboard
- Error rate by endpoint
- Error count by user
- Top error types
- Geographic error distribution

#### Performance Dashboard
- Transaction throughput
- Average response times
- Slow queries
- Memory usage trends

#### Business Metrics Dashboard
- Message send failures by provider
- Authentication failures
- Subscription errors
- User activity errors

### 3. Release Tracking

Configure releases to track error introduction:

```bash
# Create release
sentry-cli releases new 1.0.0

# Associate commits
sentry-cli releases set-commits 1.0.0 --auto

# Deploy release
sentry-cli releases deploys 1.0.0 new -e production
```

## Integration with Existing Services

### 1. Database Pool Error Tracking
```typescript
// In database.ts
import { trackDatabaseError } from '../middleware/errorTracking';

pool.on('error', (err) => {
  trackDatabaseError(err, 'connection_pool_error');
});
```

### 2. Queue Error Tracking
```typescript
// In emailQueue.service.ts
worker.on('failed', (job: any, err: Error) => {
  trackAPIError(err, 'email_queue_job', job.data.provider);
});
```

### 3. Webhook Error Tracking
```typescript
// In webhooks controller
try {
  await processWebhook(payload);
} catch (error) {
  trackAPIError(error, 'webhook_processing', provider);
  throw error;
}
```

## Performance Optimization

### 1. Sampling Strategies

#### High-Traffic Endpoints
```typescript
// Reduce sampling for high-volume endpoints
if (req.path.includes('/api/channels/') && req.method === 'GET') {
  // Sample only 1% of successful requests
  if (Math.random() > 0.01) return;
}
```

#### Critical Operations
```typescript
// Always track critical operations
if (req.path.includes('/api/billing/') || req.path.includes('/api/auth/')) {
  // Always track billing and auth operations
}
```

### 2. Context Optimization

```typescript
// Limit context size for performance
const limitedContext = {
  ...context,
  body: JSON.stringify(context.body).length > 1000 
    ? '[Large Body Truncated]' 
    : context.body
};
```

## Monitoring & Maintenance

### 1. Daily Checks
- Review error trends
- Check alert fatigue
- Verify sampling rates
- Monitor quota usage

### 2. Weekly Reviews
- Analyze error patterns
- Update alert thresholds
- Review performance impact
- Plan error fixes

### 3. Monthly Optimization
- Adjust sampling rates
- Update error filters
- Review dashboard relevance
- Optimize context data

## Troubleshooting

### Common Issues

1. **High Quota Usage**
   - Reduce sampling rates
   - Add more error filters
   - Optimize context data

2. **Missing Errors**
   - Check error filters
   - Verify DSN configuration
   - Test error capturing

3. **Too Many Alerts**
   - Adjust alert thresholds
   - Add error filters
   - Group similar errors

### Debug Commands

```bash
# Test Sentry connection
curl -X POST \
  'https://sentry.io/api/0/projects/your-org/your-project/store/' \
  -H 'X-Sentry-Auth: Sentry sentry_key=YOUR_KEY' \
  -d '{"message":"Test message"}'

# Check error tracking
curl -X POST http://localhost:3001/api/test/error \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

This completes the comprehensive error tracking setup with production-ready configuration, sampling optimization, and monitoring dashboards.
