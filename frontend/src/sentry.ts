// Optional Sentry init for frontend (only if DSN present)
// Usage: import './sentry' in index.tsx
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import * as Sentry from '@sentry/react';

const dsn = process.env.REACT_APP_SENTRY_DSN;
if (dsn) {
  const environment = process.env.NODE_ENV || 'development';
  const tracesSampleRate = Number(process.env.REACT_APP_SENTRY_TRACES_SAMPLE_RATE || 0.1);
  
  Sentry.init({
    dsn,
    environment,
    tracesSampleRate,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    // Session replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    // Enhanced error filtering
    beforeSend(event) {
      // Filter out common non-critical errors
      if (event.exception) {
        const error = event.exception.values?.[0];
        if (error?.type === 'ChunkLoadError' || 
            error?.value?.includes('Loading chunk')) {
          return null; // Don't send chunk load errors
        }
      }
      return event;
    },
    // Add release tracking
    release: process.env.REACT_APP_VERSION || 'unknown',
    // Add initial scope
    initialScope: {
      tags: {
        component: 'frontend',
        service: 'whatsapp-integration'
      }
    }
  });
  
  console.log(`📊 Frontend Sentry monitoring enabled (${environment})`);
  console.log(`📊 Traces sample rate: ${tracesSampleRate * 100}%`);
}

// Export utility functions for use in components
export const captureError = (error: unknown, context?: Record<string, any>) => {
  if (!dsn) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
};

export const captureMessage = (message: string, level: 'info' | 'warning' | 'error' = 'info') => {
  if (!dsn) return;
  Sentry.captureMessage(message, level);
};

export const setUserContext = (user: { id?: string; email?: string; [key: string]: any }) => {
  if (!dsn) return;
  Sentry.setUser(user);
};

export const addBreadcrumb = (message: string, category?: string) => {
  if (!dsn) return;
  Sentry.addBreadcrumb({
    message,
    category: category || 'custom',
    level: 'info'
  });
};


