import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { pool } from './config/database';

// Import routes
import channelsRoutes from './routes/channels.routes';
import webhooksRoutes from './routes/webhooks.routes';
import authRoutes from './routes/auth.routes';
import userCredentialsRoutes from './routes/user-credentials.routes';
import usageAnalyticsRoutes from './routes/usageAnalytics.routes';
import bounceComplaintRoutes from './routes/bounceComplaint.routes';
import billingRoutes from './routes/billing.routes';
import adminRoutes from './routes/admin.routes';
import { initEmailQueue, getQueueHealth, closeQueue } from './services/emailQueue.service';
import { requestMetricsMiddleware, getMetricsText, getDetailedMetrics } from './services/simpleMetrics';
import bodyParser from 'body-parser';
import { initMonitoring, getSentryHandlers, getMonitoringStatus } from './services/monitoring';
import { errorTrackingMiddleware, globalErrorHandler } from './middleware/errorTracking';
import { initGraphNotificationWorker, closeGraphNotificationWorker } from './workers/graphNotificationWorker';
import { initSubscriptionRenewalService, closeSubscriptionRenewalService, getRenewalQueueHealth } from './services/graphSubscriptionRenewal';

dotenv.config();

const app = express();
// Monitoring (Sentry) - conditional
const mon = initMonitoring();
if (mon.enabled) {
  const { requestHandler } = getSentryHandlers();
  if (requestHandler) app.use(requestHandler);
}
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

// Stripe webhook raw body must be available before JSON middleware
app.use('/api/webhooks/stripe', bodyParser.raw({ type: 'application/json' }));

// JSON parsing - simple approach for the rest
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestMetricsMiddleware);

// Error tracking middleware
app.use(errorTrackingMiddleware);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    database: 'connected'
  });
});

// Make io instance available to routes
app.set('io', io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/channels', channelsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userCredentialsRoutes);
app.use('/api/usage', usageAnalyticsRoutes);
app.use('/api/email', bounceComplaintRoutes);

// Global error handler (should be after routes)
app.use(globalErrorHandler);

// Sentry error handler should be after routes
if (mon.enabled) {
  const { errorHandler } = getSentryHandlers();
  if (errorHandler) app.use(errorHandler);
}

// Metrics and readiness
app.get('/metrics', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.send(getMetricsText());
});

// Detailed metrics dashboard endpoint
app.get('/metrics/dashboard', (req, res) => {
  res.json(getDetailedMetrics());
});
app.get('/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    const health: any = { ok: true, database: 'connected' };
    
    if (process.env.REDIS_URL) {
      const { getRedis } = await import('./services/redisClient');
      const r = getRedis();
      if (!r) return res.status(500).json({ ok: false, reason: 'redis_unavailable' });
      const pong = await r.ping();
      if (pong !== 'PONG') return res.status(500).json({ ok: false, reason: 'redis_ping_failed' });
      health.redis = 'connected';
      
      // Check queue health
      const queueHealth = await getQueueHealth();
      health.queue = queueHealth;
      
      // Check Graph renewal queue health
      const renewalHealth = await getRenewalQueueHealth();
      health.graphRenewalQueue = renewalHealth;
    }
    
    // Add monitoring status
    health.monitoring = getMonitoringStatus();
    
    res.json(health);
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

// Monitoring status endpoint
app.get('/monitoring', (req, res) => {
  const status = getMonitoringStatus();
  res.json({
    ...status,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version,
    platform: process.platform
  });
});

// Test error tracking endpoint (development only)
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/test/error', (req, res) => {
    const errorType = req.body.type || 'generic';
    
    switch (errorType) {
      case 'server':
        throw new Error('Test server error for Sentry tracking');
      case 'database':
        const { trackDatabaseError } = require('./middleware/errorTracking');
        trackDatabaseError(new Error('Test database error'), 'SELECT * FROM test', []);
        res.json({ message: 'Database error tracked' });
        break;
      case 'api':
        const { trackAPIError } = require('./middleware/errorTracking');
        trackAPIError(new Error('Test API error'), 'test_endpoint', 'test_provider');
        res.json({ message: 'API error tracked' });
        break;
      default:
        res.status(400).json({ error: 'Test client error' });
    }
  });
}

// Direct Gmail OAuth callback route (for compatibility with Google OAuth config)
app.get('/auth/gmail/callback', (req, res) => {
  // Redirect to the API route
  const { code, state, scope } = req.query;
  const redirectUrl = `/api/auth/gmail/callback?code=${code}&state=${state}&scope=${scope}`;
  res.redirect(redirectUrl);
});

// Direct Outlook OAuth callback route (for compatibility with Microsoft OAuth config)
app.get('/auth/outlook/callback', (req, res) => {
  // Redirect to the API route
  const queryString = new URLSearchParams(req.query as any).toString();
  const redirectUrl = `/api/auth/outlook/callback?${queryString}`;
  res.redirect(redirectUrl);
});

// Socket.io connection handling with JWT authentication
io.on('connection', (socket) => {
  console.log(`✅ Client connected: ${socket.id}`);

  // Join user's room for real-time updates
  socket.on('join-user', (userId: string) => {
    // Verify the user ID matches the authenticated user from the token
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const secret = process.env.JWT_SECRET;
        if (secret) {
          const decoded = jwt.verify(token, secret) as { userId: string; email: string };
          if (decoded.userId === userId) {
            socket.join(`user:${userId}`);
            console.log(`User ${userId} joined their room`);
          } else {
            console.log(`❌ User ID mismatch: ${userId} vs ${decoded.userId}`);
          }
        }
      } catch (error) {
        console.log(`❌ Invalid token for user: ${userId}`);
      }
    } else {
      // Fallback for development - allow any user ID
      socket.join(`user:${userId}`);
      console.log(`User ${userId} joined their room (no auth)`);
    }
  });

  // Join chat room for live messages
  socket.on('join-chat', (chatId: string) => {
    socket.join(`chat:${chatId}`);
    console.log(`Socket ${socket.id} joined chat ${chatId}`);
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// Export io for use in controllers
export { io };

// Start server
async function startServer() {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful');

    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 Socket.io ready for connections`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`💰 Pricing mode: ${process.env.PRICING_MODE || 'bundled'}`);
      // Initialize BullMQ email queue if Redis configured
      if (process.env.REDIS_URL) {
        initEmailQueue();
        console.log('📨 Email queue initialized');
        
        // Initialize Graph notification worker
        initGraphNotificationWorker();
        console.log('📧 Graph notification worker initialized');
        
        // Initialize subscription renewal service
        initSubscriptionRenewalService();
        console.log('🔄 Graph subscription renewal service initialized');
      } else {
        console.log('📨 Email queue disabled (no REDIS_URL)');
        console.log('📧 Graph services disabled (no REDIS_URL)');
      }

      
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  // Close BullMQ connections
  if (process.env.REDIS_URL) {
    await closeQueue();
    console.log('📨 Email queue closed');
    
    await closeGraphNotificationWorker();
    console.log('📧 Graph notification worker closed');
    
    await closeSubscriptionRenewalService();
    console.log('🔄 Graph subscription renewal service closed');
  }
  
  await pool.end();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  
  // Close BullMQ connections
  if (process.env.REDIS_URL) {
    await closeQueue();
    console.log('📨 Email queue closed');
    
    await closeGraphNotificationWorker();
    console.log('📧 Graph notification worker closed');
    
    await closeSubscriptionRenewalService();
    console.log('🔄 Graph subscription renewal service closed');
  }
  
  await pool.end();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

