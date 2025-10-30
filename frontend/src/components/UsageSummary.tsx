import React from 'react';
import { usageAnalyticsService } from '../services/usageAnalytics.service';
import './UsageSummary.css';

interface UsageSummaryProps {
  totals: {
    sent: number;
    received: number;
    limit: number;
    remaining: number;
    percentage: number;
  };
  currentMonth: string;
}

const UsageSummary: React.FC<UsageSummaryProps> = ({ totals, currentMonth }) => {
  const { sent, received, limit, remaining, percentage } = totals;
  const totalMessages = sent + received;

  const getStatusColor = (percentage: number) => {
    if (percentage >= 100) return '#ef4444';
    if (percentage >= 90) return '#f59e0b';
    if (percentage >= 75) return '#3b82f6';
    return '#10b981';
  };

  const getStatusMessage = (percentage: number) => {
    if (percentage >= 100) return 'Limit exceeded';
    if (percentage >= 90) return 'Approaching limit';
    if (percentage >= 75) return 'High usage';
    return 'Normal usage';
  };

  const statusColor = getStatusColor(percentage);
  const statusMessage = getStatusMessage(percentage);

  return (
    <div className="usage-summary">
      <div className="summary-header">
        <h2>📊 Usage Summary</h2>
        <div className="month-display">
          {usageAnalyticsService.formatMonth(currentMonth)}
        </div>
      </div>

      <div className="summary-grid">
        {/* Total Messages */}
        <div className="summary-card primary">
          <div className="card-header">
            <span className="card-icon">📱</span>
            <span className="card-title">Total Messages</span>
          </div>
          <div className="card-value">
            {usageAnalyticsService.formatNumber(totalMessages)}
          </div>
          <div className="card-subtitle">
            {usageAnalyticsService.formatNumber(sent)} sent • {usageAnalyticsService.formatNumber(received)} received
          </div>
        </div>

        {/* Messages Sent */}
        <div className="summary-card">
          <div className="card-header">
            <span className="card-icon">📤</span>
            <span className="card-title">Messages Sent</span>
          </div>
          <div className="card-value">
            {usageAnalyticsService.formatNumber(sent)}
          </div>
          <div className="card-subtitle">
            {usageAnalyticsService.formatPercentage((sent / limit) * 100)} of limit
          </div>
        </div>

        {/* Messages Received */}
        <div className="summary-card">
          <div className="card-header">
            <span className="card-icon">📥</span>
            <span className="card-title">Messages Received</span>
          </div>
          <div className="card-value">
            {usageAnalyticsService.formatNumber(received)}
          </div>
          <div className="card-subtitle">
            Incoming messages
          </div>
        </div>

        {/* Usage Status */}
        <div className="summary-card status" style={{ '--status-color': statusColor } as React.CSSProperties}>
          <div className="card-header">
            <span className="card-icon">⚡</span>
            <span className="card-title">Usage Status</span>
          </div>
          <div className="card-value">
            {usageAnalyticsService.formatPercentage(percentage)}
          </div>
          <div className="card-subtitle">
            {statusMessage}
          </div>
          <div className="usage-bar">
            <div 
              className="usage-fill"
              style={{ 
                width: `${Math.min(percentage, 100)}%`,
                backgroundColor: statusColor
              }}
            />
          </div>
        </div>

        {/* Remaining Messages */}
        <div className="summary-card">
          <div className="card-header">
            <span className="card-icon">🎯</span>
            <span className="card-title">Remaining</span>
          </div>
          <div className="card-value">
            {usageAnalyticsService.formatNumber(remaining)}
          </div>
          <div className="card-subtitle">
            Messages left this month
          </div>
        </div>

        {/* Daily Average */}
        <div className="summary-card">
          <div className="card-header">
            <span className="card-icon">📅</span>
            <span className="card-title">Daily Average</span>
          </div>
          <div className="card-value">
            {Math.round(sent / new Date().getDate())}
          </div>
          <div className="card-subtitle">
            Messages per day
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="quick-stats">
        <div className="quick-stat">
          <span className="stat-label">Limit:</span>
          <span className="stat-value">{usageAnalyticsService.formatNumber(limit)}</span>
        </div>
        <div className="quick-stat">
          <span className="stat-label">Used:</span>
          <span className="stat-value">{usageAnalyticsService.formatNumber(sent)}</span>
        </div>
        <div className="quick-stat">
          <span className="stat-label">Remaining:</span>
          <span className="stat-value">{usageAnalyticsService.formatNumber(remaining)}</span>
        </div>
        <div className="quick-stat">
          <span className="stat-label">Status:</span>
          <span className="stat-value" style={{ color: statusColor }}>
            {statusMessage}
          </span>
        </div>
      </div>
    </div>
  );
};

export default UsageSummary;
