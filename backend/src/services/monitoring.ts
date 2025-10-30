import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { RequestHandler, ErrorRequestHandler } from 'express';

let sentryEnabled = false;
let requestHandler: RequestHandler | null = null;
let errorHandler: ErrorRequestHandler | null = null;

export function initMonitoring() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('📊 Sentry monitoring disabled (no SENTRY_DSN)');
    return { enabled: false };
  }
  
  const environment = process.env.APP_ENV || process.env.NODE_ENV || 'development';
  const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1);
  const profilesSampleRate = Number(process.env.SENTRY_PROFILES_SAMPLE_RATE || 0.1);
  
  Sentry.init({
    dsn,
    environment,
    integrations: [
      nodeProfilingIntegration(),
      // Add more integrations for better monitoring
      Sentry.httpIntegration({ tracing: true }),
    ],
    tracesSampleRate,
    profilesSampleRate,
    // Enhanced error filtering
    beforeSend(event) {
      // Filter out common non-critical errors
      if (event.exception) {
        const error = event.exception.values?.[0];
        if (error?.type === 'UnauthorizedError' || 
            error?.value?.includes('Invalid or expired token')) {
          return null; // Don't send auth errors to Sentry
        }
      }
      return event;
    },
    // Add release tracking
    release: process.env.APP_VERSION || 'unknown',
    // Add user context
    initialScope: {
      tags: {
        component: 'backend',
        service: 'whatsapp-integration'
      }
    }
  });
  
  sentryEnabled = true;
  requestHandler = Sentry.Handlers.requestHandler({
    ip: false, // Don't capture IP addresses for privacy
    user: ['id', 'email'] // Only capture specific user fields
  });
  errorHandler = Sentry.Handlers.errorHandler({
    shouldHandleError(error: any) {
      // Only handle 5xx errors and specific 4xx errors
      const status = Number(error.status || 500);
      return status >= 500 || status === 429;
    }
  });
  
  console.log(`📊 Sentry monitoring enabled (${environment})`);
  console.log(`📊 Traces sample rate: ${tracesSampleRate * 100}%`);
  console.log(`📊 Profiles sample rate: ${profilesSampleRate * 100}%`);
  
  return { enabled: true, environment, tracesSampleRate, profilesSampleRate };
}

export function getSentryHandlers() {
  return { requestHandler, errorHandler };
}

export function captureError(e: unknown, context?: Record<string, any>) {
  if (!sentryEnabled) return;
  Sentry.captureException(e, context ? { extra: context } : undefined);
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: Record<string, any>) {
  if (!sentryEnabled) return;
  Sentry.captureMessage(message, { level, extra: context });
}

export function setUserContext(user: { id?: string; email?: string; [key: string]: any }) {
  if (!sentryEnabled) return;
  Sentry.setUser(user);
}

export function addBreadcrumb(message: string, category?: string, level?: 'info' | 'warning' | 'error') {
  if (!sentryEnabled) return;
  Sentry.addBreadcrumb({
    message,
    category: category || 'custom',
    level: level || 'info',
    timestamp: Date.now() / 1000
  });
}

export function startTransaction(name: string, op: string) {
  if (!sentryEnabled) return null;
  return Sentry.startTransaction({ name, op });
}

export function getMonitoringStatus() {
  return {
    enabled: sentryEnabled,
    dsn: sentryEnabled ? '***configured***' : null,
    environment: process.env.APP_ENV || process.env.NODE_ENV || 'development',
    release: process.env.APP_VERSION || 'unknown'
  };
}


