# BullMQ Queue Configuration

## Overview

BullMQ is configured for reliable email processing with Redis as the backing store. The system supports both embedded workers (in the main process) and standalone worker processes.

## Configuration

### Environment Variables

```env
# Required
REDIS_URL=redis://localhost:6379

# Optional
EMAIL_QUEUE_CONCURRENCY=5          # Number of concurrent jobs per worker
BULLMQ_PREFIX=whatsapp_app          # Redis key prefix for queues
REDIS_DB=0                          # Redis database number
REDIS_TLS=false                     # Enable TLS for Redis connection
```

### Queue Features

- **Retry Logic**: 3 attempts with exponential backoff (2s base delay)
- **Job Cleanup**: Keeps last 100 completed jobs, 500 failed jobs
- **Stall Detection**: 30-second timeout with max 1 stall count
- **Health Monitoring**: Queue status available via `/ready` endpoint

## Usage

### Starting Workers

#### Embedded Worker (Development)
The main server process includes a worker when `REDIS_URL` is configured:

```bash
npm run dev
```

#### Standalone Worker (Production)
For production, run dedicated worker processes:

```bash
# Development with auto-reload
npm run worker:email

# Production
npm run build
npm run worker:email:prod
```

### Adding Jobs to Queue

```typescript
import { enqueueSend } from '../services/emailQueue.service';

// Queue an email job
const result = await enqueueSend({
  provider: 'gmail',
  url: 'http://localhost:3001/api/email/send',
  method: 'POST',
  body: {
    to: 'user@example.com',
    subject: 'Test Email',
    body: 'Hello World'
  },
  headers: {
    'Authorization': 'Bearer token'
  }
}, {
  delay: 5000, // Optional delay in ms
  priority: 1  // Optional priority (higher = more priority)
});

console.log('Job queued:', result.id);
```

### Health Monitoring

Check queue health via the readiness endpoint:

```bash
curl http://localhost:3001/ready
```

Response includes queue statistics:
```json
{
  "ok": true,
  "database": "connected",
  "redis": "connected",
  "queue": {
    "available": true,
    "counts": {
      "waiting": 0,
      "active": 1,
      "completed": 45,
      "failed": 2
    }
  }
}
```

## Production Deployment

### Docker Compose

The `docker-compose.yml` includes Redis and BullMQ configuration:

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  backend:
    environment:
      REDIS_URL: redis://redis:6379
      EMAIL_QUEUE_CONCURRENCY: 5
      BULLMQ_PREFIX: "whatsapp_app"
```

### Scaling Workers

Run multiple worker processes for high throughput:

```bash
# Terminal 1
WORKER_ID=1 npm run worker:email:prod

# Terminal 2  
WORKER_ID=2 npm run worker:email:prod

# Terminal 3
WORKER_ID=3 npm run worker:email:prod
```

### Process Management

Use PM2 for production process management:

```bash
# Install PM2
npm install -g pm2

# Start main server
pm2 start dist/index.js --name "whatsapp-api"

# Start email workers
pm2 start dist/workers/emailWorker.js --name "email-worker-1" --instances 1
pm2 start dist/workers/emailWorker.js --name "email-worker-2" --instances 1

# Monitor
pm2 monit
```

## Monitoring & Debugging

### Queue Dashboard

Install BullMQ Board for web-based monitoring:

```bash
npm install -g @bull-board/api @bull-board/express
```

### Logs

Worker processes log job processing:

```
📧 Processing email job 123 for gmail
✅ Email job 123 completed successfully
❌ Job 456 failed: Send failed: 500 - Internal Server Error
⚠️ Job 789 stalled
```

### Redis CLI

Monitor queue activity directly:

```bash
redis-cli
> KEYS whatsapp_app:*
> LLEN whatsapp_app:email-send:waiting
> LLEN whatsapp_app:email-send:active
```

## Error Handling

### Retry Policy

Jobs automatically retry with exponential backoff:
- Attempt 1: Immediate
- Attempt 2: 2 seconds delay  
- Attempt 3: 4 seconds delay
- After 3 failures: Job moves to failed queue

### Failed Job Recovery

```typescript
import { getQueueHealth } from '../services/emailQueue.service';

// Check failed jobs
const health = await getQueueHealth();
console.log('Failed jobs:', health.counts.failed);

// Manual retry (implement as needed)
// const failedJobs = await queue.getFailed();
// await failedJobs[0].retry();
```

## Performance Tuning

### Concurrency

Adjust based on your system resources:

```env
# Conservative (low memory)
EMAIL_QUEUE_CONCURRENCY=2

# Aggressive (high throughput)
EMAIL_QUEUE_CONCURRENCY=10
```

### Memory Management

Configure job cleanup to prevent memory bloat:

```typescript
// In emailQueue.service.ts
removeOnComplete: 50,   // Keep fewer completed jobs
removeOnFail: 100,      // Keep more failed jobs for debugging
```

### Redis Optimization

For high-volume production:

```env
# Use dedicated Redis instance
REDIS_URL=redis://redis-queue.example.com:6379

# Use separate database
REDIS_DB=1
```

## Troubleshooting

### Common Issues

1. **Jobs not processing**: Check Redis connection and worker startup logs
2. **High memory usage**: Reduce `removeOnComplete` and `removeOnFail` values
3. **Slow processing**: Increase `EMAIL_QUEUE_CONCURRENCY` or add more workers
4. **Connection errors**: Verify `REDIS_URL` and network connectivity

### Debug Commands

```bash
# Check Redis connectivity
redis-cli ping

# Monitor queue keys
redis-cli --scan --pattern "whatsapp_app:*"

# Check worker logs
pm2 logs email-worker-1
```

## Integration Examples

### Gmail Controller Integration

```typescript
// In gmail.controller.ts
import { enqueueSend } from '../services/emailQueue.service';

export async function sendEmail(req: Request, res: Response) {
  // Validate request...
  
  // Queue the email instead of sending immediately
  const result = await enqueueSend({
    provider: 'gmail',
    url: `${process.env.API_BASE_URL}/api/gmail/send-direct`,
    body: req.body,
    headers: {
      'Authorization': req.headers.authorization
    }
  });
  
  if (result.queued) {
    res.json({ success: true, jobId: result.id, queued: true });
  } else {
    // Fallback to direct send
    return sendEmailDirect(req, res);
  }
}
```

This completes the BullMQ configuration with production-ready features, monitoring, and documentation.
