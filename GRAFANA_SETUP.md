# Grafana Performance Monitoring Setup

## Overview

Complete Grafana setup for monitoring WhatsApp Integration Platform with Prometheus metrics, custom dashboards, and alerting.

## Prerequisites

- Docker and Docker Compose
- Running application with metrics enabled
- Basic understanding of Prometheus/Grafana

## Quick Setup with Docker Compose

### 1. Add Monitoring Stack to docker-compose.yml

```yaml
services:
  # ... existing services ...

  prometheus:
    image: prom/prometheus:latest
    container_name: whatsapp-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--storage.tsdb.retention.time=200h'
      - '--web.enable-lifecycle'

  grafana:
    image: grafana/grafana:latest
    container_name: whatsapp-grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin123
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana/provisioning:/etc/grafana/provisioning
      - ./monitoring/grafana/dashboards:/var/lib/grafana/dashboards
    depends_on:
      - prometheus

volumes:
  prometheus_data:
  grafana_data:
```

### 2. Create Prometheus Configuration

Create `monitoring/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"

scrape_configs:
  - job_name: 'whatsapp-backend'
    static_configs:
      - targets: ['backend:3001']
    metrics_path: '/metrics'
    scrape_interval: 10s
    
  - job_name: 'whatsapp-detailed'
    static_configs:
      - targets: ['backend:3001']
    metrics_path: '/metrics/dashboard'
    scrape_interval: 30s

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093
```

### 3. Create Alert Rules

Create `monitoring/alert_rules.yml`:

```yaml
groups:
  - name: whatsapp_alerts
    rules:
      - alert: HighErrorRate
        expr: (app_requests_errors_total / app_requests_total) * 100 > 5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }}% for the last 5 minutes"

      - alert: HighResponseTime
        expr: app_request_duration_seconds_avg > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High response time detected"
          description: "Average response time is {{ $value }}s"

      - alert: HighMemoryUsage
        expr: (app_memory_heap_used_bytes / app_memory_heap_total_bytes) * 100 > 90
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High memory usage"
          description: "Memory usage is {{ $value }}%"

      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service is down"
          description: "{{ $labels.instance }} has been down for more than 1 minute"
```

## Grafana Dashboard Configuration

### 1. Application Overview Dashboard

Create `monitoring/grafana/dashboards/app-overview.json`:

```json
{
  "dashboard": {
    "title": "WhatsApp Integration - Overview",
    "panels": [
      {
        "title": "Request Rate",
        "type": "stat",
        "targets": [
          {
            "expr": "rate(app_requests_total[5m])",
            "legendFormat": "Requests/sec"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "stat",
        "targets": [
          {
            "expr": "(rate(app_requests_errors_total[5m]) / rate(app_requests_total[5m])) * 100",
            "legendFormat": "Error %"
          }
        ]
      },
      {
        "title": "Response Time",
        "type": "stat",
        "targets": [
          {
            "expr": "app_request_duration_seconds_avg",
            "legendFormat": "Avg Response Time"
          }
        ]
      },
      {
        "title": "Memory Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "app_memory_heap_used_bytes",
            "legendFormat": "Heap Used"
          },
          {
            "expr": "app_memory_heap_total_bytes",
            "legendFormat": "Heap Total"
          }
        ]
      },
      {
        "title": "Request Volume by Route",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(app_route_requests_total[5m])",
            "legendFormat": "{{ route }}"
          }
        ]
      },
      {
        "title": "HTTP Status Codes",
        "type": "piechart",
        "targets": [
          {
            "expr": "app_http_status_total",
            "legendFormat": "{{ code }}"
          }
        ]
      }
    ]
  }
}
```

### 2. Performance Dashboard

Key metrics to track:

- **Request Throughput**: `rate(app_requests_total[5m])`
- **Error Rate**: `(rate(app_requests_errors_total[5m]) / rate(app_requests_total[5m])) * 100`
- **Response Time P95**: `histogram_quantile(0.95, rate(app_request_duration_seconds_bucket[5m]))`
- **Memory Usage**: `app_memory_heap_used_bytes / app_memory_heap_total_bytes * 100`
- **Active Connections**: `app_requests_in_flight`

### 3. Business Metrics Dashboard

Application-specific metrics:

- **Messages Sent**: Custom counter for message operations
- **User Activity**: Active users, login rates
- **Provider Performance**: WhatsApp vs Instagram response times
- **Queue Health**: BullMQ job processing rates

## Custom Metrics Integration

### 1. Add Business Metrics

```typescript
// In your controllers
import { incrementCounter, recordHistogram } from '../services/customMetrics';

export async function sendMessage(req: Request, res: Response) {
  const start = Date.now();
  try {
    await unipileService.sendMessage(accountId, chatId, message);
    
    // Record success metrics
    incrementCounter('messages_sent_total', { provider: 'whatsapp', status: 'success' });
    recordHistogram('message_send_duration_seconds', (Date.now() - start) / 1000);
    
    res.json({ success: true });
  } catch (error) {
    incrementCounter('messages_sent_total', { provider: 'whatsapp', status: 'error' });
    throw error;
  }
}
```

### 2. Database Performance Metrics

```typescript
// Add to database queries
import { recordHistogram } from '../services/customMetrics';

export async function getUserData(userId: string) {
  const start = Date.now();
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    recordHistogram('db_query_duration_seconds', (Date.now() - start) / 1000, { 
      query: 'get_user',
      table: 'users' 
    });
    return result.rows[0];
  } catch (error) {
    recordHistogram('db_query_duration_seconds', (Date.now() - start) / 1000, { 
      query: 'get_user',
      table: 'users',
      status: 'error'
    });
    throw error;
  }
}
```

## Advanced Grafana Features

### 1. Alerting Setup

```yaml
# In Grafana UI: Alerting > Alert Rules
- name: High Error Rate
  condition: 
    query: (rate(app_requests_errors_total[5m]) / rate(app_requests_total[5m])) * 100
    threshold: > 5
  notifications:
    - slack
    - email

- name: Memory Leak Detection
  condition:
    query: increase(app_memory_heap_used_bytes[1h])
    threshold: > 100MB
  notifications:
    - slack
```

### 2. Variable Templates

Create dashboard variables for dynamic filtering:

- **Environment**: `label_values(app_requests_total, environment)`
- **Route**: `label_values(app_route_requests_total, route)`
- **Time Range**: `$__timeFilter()`

### 3. Annotation Queries

Track deployments and incidents:

```sql
-- Deployment annotations
SELECT
  time,
  'Deployment' as title,
  version as text,
  'deployment' as tags
FROM deployments
WHERE $__timeFilter(time)
```

## Production Optimization

### 1. Retention Policies

```yaml
# prometheus.yml
global:
  external_labels:
    environment: 'production'

# Retention settings
storage:
  tsdb:
    retention.time: 30d
    retention.size: 10GB
```

### 2. Recording Rules

Pre-compute expensive queries:

```yaml
# recording_rules.yml
groups:
  - name: whatsapp_recording_rules
    interval: 30s
    rules:
      - record: app:request_rate_5m
        expr: rate(app_requests_total[5m])
        
      - record: app:error_rate_5m
        expr: rate(app_requests_errors_total[5m]) / rate(app_requests_total[5m])
        
      - record: app:response_time_p95_5m
        expr: histogram_quantile(0.95, rate(app_request_duration_seconds_bucket[5m]))
```

### 3. Dashboard Performance

- Use recording rules for complex queries
- Limit time ranges for heavy dashboards
- Use template variables to reduce cardinality
- Cache dashboard queries when possible

## Monitoring Best Practices

### 1. Metric Naming

Follow Prometheus conventions:
- `app_requests_total` (counter)
- `app_request_duration_seconds` (histogram)
- `app_memory_usage_bytes` (gauge)

### 2. Label Strategy

- Keep cardinality low (< 10 values per label)
- Use meaningful label names
- Avoid user IDs or high-cardinality data

### 3. Dashboard Organization

- **Overview**: High-level KPIs
- **Performance**: Response times, throughput
- **Errors**: Error rates, types, trends
- **Infrastructure**: Memory, CPU, disk
- **Business**: Messages, users, revenue

## Troubleshooting

### Common Issues

1. **High Cardinality**: Too many unique label combinations
   - Solution: Reduce label values, use recording rules

2. **Slow Dashboards**: Complex queries taking too long
   - Solution: Use recording rules, optimize time ranges

3. **Missing Metrics**: Metrics not appearing in Grafana
   - Solution: Check Prometheus targets, verify scrape configs

### Debug Commands

```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Test metric queries
curl http://localhost:9090/api/v1/query?query=app_requests_total

# Check Grafana health
curl http://localhost:3001/api/health
```

## Deployment

### 1. Start Monitoring Stack

```bash
# Start all services
docker-compose up -d

# Check services
docker-compose ps

# View logs
docker-compose logs grafana
docker-compose logs prometheus
```

### 2. Access Dashboards

- **Grafana**: http://localhost:3001 (admin/admin123)
- **Prometheus**: http://localhost:9090
- **App Metrics**: http://localhost:3001/metrics

### 3. Import Dashboards

1. Go to Grafana → Dashboards → Import
2. Upload the JSON dashboard files
3. Configure data sources (Prometheus)
4. Set up alerts and notifications

This completes the comprehensive Grafana setup with performance monitoring, custom dashboards, and production-ready configuration.
