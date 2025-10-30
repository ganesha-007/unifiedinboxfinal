import { Request, Response, NextFunction } from 'express';

type RouteMetrics = {
  requests: number;
  errors: number;
  totalDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  lastRequestAt: number;
};

type Metrics = {
  startTimeMs: number;
  totalRequests: number;
  totalErrors: number;
  totalDurationMs: number;
  inFlight: number;
  routes: Map<string, RouteMetrics>;
  statusCodes: Map<number, number>;
  userAgents: Map<string, number>;
  slowRequests: Array<{
    method: string;
    path: string;
    duration: number;
    timestamp: number;
    statusCode: number;
  }>;
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    timestamp: number;
  };
};

const metrics: Metrics = {
  startTimeMs: Date.now(),
  totalRequests: 0,
  totalErrors: 0,
  totalDurationMs: 0,
  inFlight: 0,
  routes: new Map(),
  statusCodes: new Map(),
  userAgents: new Map(),
  slowRequests: [],
  memoryUsage: {
    rss: 0,
    heapTotal: 0,
    heapUsed: 0,
    external: 0,
    timestamp: Date.now()
  }
};

// Update memory usage every 30 seconds
setInterval(() => {
  const memory = process.memoryUsage();
  metrics.memoryUsage = {
    ...memory,
    timestamp: Date.now()
  };
}, 30000);

export function requestMetricsMiddleware(req: Request, res: Response, next: NextFunction) {
  metrics.totalRequests += 1;
  metrics.inFlight += 1;
  const start = process.hrtime.bigint();
  const routeKey = `${req.method} ${req.route?.path || req.path}`;
  
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durMs = Number(end - start) / 1e6;
    
    // Update global metrics
    metrics.totalDurationMs += durMs;
    if (res.statusCode >= 500) metrics.totalErrors += 1;
    metrics.inFlight -= 1;
    
    // Update route-specific metrics
    const routeMetrics = metrics.routes.get(routeKey) || {
      requests: 0,
      errors: 0,
      totalDurationMs: 0,
      minDurationMs: Infinity,
      maxDurationMs: 0,
      lastRequestAt: 0
    };
    
    routeMetrics.requests += 1;
    routeMetrics.totalDurationMs += durMs;
    routeMetrics.minDurationMs = Math.min(routeMetrics.minDurationMs, durMs);
    routeMetrics.maxDurationMs = Math.max(routeMetrics.maxDurationMs, durMs);
    routeMetrics.lastRequestAt = Date.now();
    if (res.statusCode >= 500) routeMetrics.errors += 1;
    
    metrics.routes.set(routeKey, routeMetrics);
    
    // Track status codes
    const statusCount = metrics.statusCodes.get(res.statusCode) || 0;
    metrics.statusCodes.set(res.statusCode, statusCount + 1);
    
    // Track user agents (simplified)
    const userAgent = req.get('User-Agent');
    if (userAgent) {
      const simplifiedUA = userAgent.split(' ')[0] || 'unknown';
      const uaCount = metrics.userAgents.get(simplifiedUA) || 0;
      metrics.userAgents.set(simplifiedUA, uaCount + 1);
    }
    
    // Track slow requests (>1 second)
    if (durMs > 1000) {
      metrics.slowRequests.push({
        method: req.method,
        path: req.path,
        duration: durMs,
        timestamp: Date.now(),
        statusCode: res.statusCode
      });
      
      // Keep only last 100 slow requests
      if (metrics.slowRequests.length > 100) {
        metrics.slowRequests = metrics.slowRequests.slice(-100);
      }
    }
  });
  
  next();
}

export function getMetricsText(): string {
  const uptimeSec = (Date.now() - metrics.startTimeMs) / 1000;
  const avgMs = metrics.totalRequests > 0 ? metrics.totalDurationMs / metrics.totalRequests : 0;
  const memory = process.memoryUsage();
  
  const lines = [
    // Basic metrics
    '# HELP app_requests_total Total HTTP requests',
    '# TYPE app_requests_total counter',
    `app_requests_total ${metrics.totalRequests}`,
    
    '# HELP app_requests_errors_total Total HTTP 5xx responses',
    '# TYPE app_requests_errors_total counter',
    `app_requests_errors_total ${metrics.totalErrors}`,
    
    '# HELP app_requests_in_flight In-flight HTTP requests',
    '# TYPE app_requests_in_flight gauge',
    `app_requests_in_flight ${metrics.inFlight}`,
    
    '# HELP app_request_duration_seconds_avg Average request duration (seconds)',
    '# TYPE app_request_duration_seconds_avg gauge',
    `app_request_duration_seconds_avg ${avgMs / 1000}`,
    
    '# HELP app_uptime_seconds Process uptime (seconds)',
    '# TYPE app_uptime_seconds gauge',
    `app_uptime_seconds ${uptimeSec}`,
    
    // Memory metrics
    '# HELP app_memory_rss_bytes Resident Set Size memory (bytes)',
    '# TYPE app_memory_rss_bytes gauge',
    `app_memory_rss_bytes ${memory.rss}`,
    
    '# HELP app_memory_heap_total_bytes Total heap memory (bytes)',
    '# TYPE app_memory_heap_total_bytes gauge',
    `app_memory_heap_total_bytes ${memory.heapTotal}`,
    
    '# HELP app_memory_heap_used_bytes Used heap memory (bytes)',
    '# TYPE app_memory_heap_used_bytes gauge',
    `app_memory_heap_used_bytes ${memory.heapUsed}`,
    
    '# HELP app_memory_external_bytes External memory (bytes)',
    '# TYPE app_memory_external_bytes gauge',
    `app_memory_external_bytes ${memory.external}`,
    
    // Route-specific metrics
    '# HELP app_route_requests_total Total requests per route',
    '# TYPE app_route_requests_total counter',
  ];
  
  // Add route metrics
  for (const [route, routeMetrics] of metrics.routes.entries()) {
    const avgDuration = routeMetrics.requests > 0 ? routeMetrics.totalDurationMs / routeMetrics.requests : 0;
    const cleanRoute = route.replace(/[^a-zA-Z0-9_]/g, '_');
    
    lines.push(`app_route_requests_total{route="${route}"} ${routeMetrics.requests}`);
    lines.push(`app_route_errors_total{route="${route}"} ${routeMetrics.errors}`);
    lines.push(`app_route_duration_avg_seconds{route="${route}"} ${avgDuration / 1000}`);
    lines.push(`app_route_duration_min_seconds{route="${route}"} ${routeMetrics.minDurationMs / 1000}`);
    lines.push(`app_route_duration_max_seconds{route="${route}"} ${routeMetrics.maxDurationMs / 1000}`);
  }
  
  // Status code metrics
  lines.push('# HELP app_http_status_total Total HTTP responses by status code');
  lines.push('# TYPE app_http_status_total counter');
  for (const [statusCode, count] of metrics.statusCodes.entries()) {
    lines.push(`app_http_status_total{code="${statusCode}"} ${count}`);
  }
  
  // Slow requests count
  lines.push('# HELP app_slow_requests_total Total slow requests (>1s)');
  lines.push('# TYPE app_slow_requests_total counter');
  lines.push(`app_slow_requests_total ${metrics.slowRequests.length}`);
  
  return lines.join('\n');
}

// Get detailed metrics for dashboard
export function getDetailedMetrics() {
  const uptimeSec = (Date.now() - metrics.startTimeMs) / 1000;
  const avgMs = metrics.totalRequests > 0 ? metrics.totalDurationMs / metrics.totalRequests : 0;
  const memory = process.memoryUsage();
  
  return {
    overview: {
      uptime: uptimeSec,
      totalRequests: metrics.totalRequests,
      totalErrors: metrics.totalErrors,
      errorRate: metrics.totalRequests > 0 ? (metrics.totalErrors / metrics.totalRequests) * 100 : 0,
      averageResponseTime: avgMs,
      requestsPerSecond: uptimeSec > 0 ? metrics.totalRequests / uptimeSec : 0,
      inFlight: metrics.inFlight
    },
    memory: {
      rss: memory.rss,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
      heapUsedPercent: (memory.heapUsed / memory.heapTotal) * 100,
      external: memory.external
    },
    routes: Array.from(metrics.routes.entries()).map(([route, routeMetrics]) => ({
      route,
      requests: routeMetrics.requests,
      errors: routeMetrics.errors,
      errorRate: routeMetrics.requests > 0 ? (routeMetrics.errors / routeMetrics.requests) * 100 : 0,
      avgDuration: routeMetrics.requests > 0 ? routeMetrics.totalDurationMs / routeMetrics.requests : 0,
      minDuration: routeMetrics.minDurationMs === Infinity ? 0 : routeMetrics.minDurationMs,
      maxDuration: routeMetrics.maxDurationMs,
      lastRequestAt: routeMetrics.lastRequestAt
    })).sort((a, b) => b.requests - a.requests),
    statusCodes: Object.fromEntries(metrics.statusCodes.entries()),
    userAgents: Object.fromEntries(Array.from(metrics.userAgents.entries()).slice(0, 10)),
    slowRequests: metrics.slowRequests.slice(-20).reverse(), // Last 20 slow requests
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid
    }
  };
}

// Reset metrics (for testing)
export function resetMetrics() {
  metrics.totalRequests = 0;
  metrics.totalErrors = 0;
  metrics.totalDurationMs = 0;
  metrics.inFlight = 0;
  metrics.routes.clear();
  metrics.statusCodes.clear();
  metrics.userAgents.clear();
  metrics.slowRequests = [];
  metrics.startTimeMs = Date.now();
}


