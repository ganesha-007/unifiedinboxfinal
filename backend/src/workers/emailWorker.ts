#!/usr/bin/env node
/**
 * Standalone BullMQ worker process for email queue processing
 * 
 * Usage:
 *   npm run worker:email
 *   or
 *   node dist/workers/emailWorker.js
 * 
 * Environment variables:
 *   REDIS_URL - Redis connection string
 *   EMAIL_QUEUE_CONCURRENCY - Number of concurrent jobs (default: 3)
 *   BULLMQ_PREFIX - Queue prefix (default: 'app')
 */

import dotenv from 'dotenv';
import { initEmailQueue, closeQueue } from '../services/emailQueue.service';

dotenv.config();

async function startWorker() {
  console.log('🚀 Starting email worker process...');
  
  if (!process.env.REDIS_URL) {
    console.error('❌ REDIS_URL environment variable is required');
    process.exit(1);
  }
  
  try {
    initEmailQueue();
    console.log('✅ Email worker started successfully');
    console.log(`📧 Concurrency: ${process.env.EMAIL_QUEUE_CONCURRENCY || 3}`);
    console.log(`🔑 Queue prefix: ${process.env.BULLMQ_PREFIX || 'app'}`);
    console.log('⏳ Waiting for jobs...');
  } catch (error) {
    console.error('❌ Failed to start email worker:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down worker gracefully...`);
  
  try {
    await closeQueue();
    console.log('✅ Worker shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start the worker
startWorker().catch((error) => {
  console.error('❌ Unhandled error in worker:', error);
  process.exit(1);
});
