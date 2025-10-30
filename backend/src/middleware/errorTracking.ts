import { Request, Response, NextFunction } from 'express';
import { captureError, setUserContext, addBreadcrumb } from '../services/monitoring';

// Enhanced error tracking middleware
export function errorTrackingMiddleware(req: Request, res: Response, next: NextFunction) {
  // Set user context if available
  if ((req as any).user) {
    setUserContext({
      id: (req as any).user.id,
      email: (req as any).user.email
    });
  }

  // Add request breadcrumb
  addBreadcrumb(
    `${req.method} ${req.path}`,
    'http',
    'info'
  );

  // Track response errors
  const originalSend = res.send;
  res.send = function(data) {
    if (res.statusCode >= 400) {
      const errorData = {
        statusCode: res.statusCode,
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        body: req.body,
        query: req.query,
        params: req.params
      };

      // Only capture server errors (5xx) and specific client errors
      if (res.statusCode >= 500 || res.statusCode === 429) {
        captureError(new Error(`HTTP ${res.statusCode}: ${req.method} ${req.url}`), errorData);
      }
    }
    return originalSend.call(this, data);
  };

  next();
}

// Global error handler with enhanced tracking
export function globalErrorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  // Set user context
  if ((req as any).user) {
    setUserContext({
      id: (req as any).user.id,
      email: (req as any).user.email
    });
  }

  // Add error context
  const errorContext = {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    body: req.body,
    query: req.query,
    params: req.params,
    stack: err.stack,
    statusCode: err.status || err.statusCode || 500
  };

  // Capture error with context
  captureError(err, errorContext);

  // Send error response
  const statusCode = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal Server Error' 
    : err.message || 'Something went wrong';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
}

// Async error wrapper
export function asyncErrorHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Database error tracking
export function trackDatabaseError(error: any, query?: string, params?: any[]) {
  captureError(error, {
    type: 'database_error',
    query,
    params,
    timestamp: new Date().toISOString()
  });
}

// API error tracking
export function trackAPIError(error: any, endpoint: string, provider?: string) {
  captureError(error, {
    type: 'api_error',
    endpoint,
    provider,
    timestamp: new Date().toISOString()
  });
}

// Business logic error tracking
export function trackBusinessError(error: any, operation: string, userId?: string) {
  if (userId) {
    setUserContext({ id: userId });
  }
  
  captureError(error, {
    type: 'business_error',
    operation,
    userId,
    timestamp: new Date().toISOString()
  });
}
