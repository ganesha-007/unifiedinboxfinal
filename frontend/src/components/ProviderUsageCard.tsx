import React from 'react';
import { MonthlyUsage } from '../services/usageAnalytics.service';
import { usageAnalyticsService } from '../services/usageAnalytics.service';
import './ProviderUsageCard.css';

interface ProviderUsageCardProps {
  usage: MonthlyUsage;
}

const ProviderUsageCard: React.FC<ProviderUsageCardProps> = ({ usage }) => {
  const { provider, sent, received, limit, remaining, percentage } = usage;
  
  const getStatusColor = (percentage: number) => {
    if (percentage >= 100) return '#ef4444';
    if (percentage >= 90) return '#f59e0b';
    if (percentage >= 75) return '#3b82f6';
    return '#10b981';
  };

  const getStatusIcon = (percentage: number) => {
    if (percentage >= 100) return '❌';
    if (percentage >= 90) return '⚠️';
    if (percentage >= 75) return '📊';
    return '✅';
  };

  const statusColor = getStatusColor(percentage);
  const statusIcon = getStatusIcon(percentage);
  const totalMessages = sent + received;

  return (
    <div className="provider-usage-card" style={{ '--status-color': statusColor } as React.CSSProperties}>
      <div className="card-header">
        <div className="provider-info">
          <span className="provider-icon">
            {usageAnalyticsService.getProviderIcon(provider)}
          </span>
          <div className="provider-details">
            <h3 className="provider-name">
              {usageAnalyticsService.getProviderDisplayName(provider)}
            </h3>
            <div className="provider-status">
              <span className="status-icon">{statusIcon}</span>
              <span className="status-text">
                {usageAnalyticsService.getStatusMessage(percentage)}
              </span>
            </div>
          </div>
        </div>
        <div className="usage-percentage">
          {usageAnalyticsService.formatPercentage(percentage)}
        </div>
      </div>

      <div className="card-content">
        <div className="usage-stats">
          <div className="stat-row">
            <span className="stat-label">Sent:</span>
            <span className="stat-value">{usageAnalyticsService.formatNumber(sent)}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Received:</span>
            <span className="stat-value">{usageAnalyticsService.formatNumber(received)}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Total:</span>
            <span className="stat-value">{usageAnalyticsService.formatNumber(totalMessages)}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Limit:</span>
            <span className="stat-value">{usageAnalyticsService.formatNumber(limit)}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Remaining:</span>
            <span className="stat-value">{usageAnalyticsService.formatNumber(remaining)}</span>
          </div>
        </div>

        <div className="usage-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ 
                width: `${Math.min(percentage, 100)}%`,
                backgroundColor: statusColor
              }}
            />
          </div>
          <div className="progress-labels">
            <span className="progress-label">0</span>
            <span className="progress-label">{usageAnalyticsService.formatNumber(limit)}</span>
          </div>
        </div>

        <div className="usage-breakdown">
          <div className="breakdown-item">
            <div className="breakdown-label">Sent Messages</div>
            <div className="breakdown-bar">
              <div 
                className="breakdown-fill sent"
                style={{ 
                  width: `${limit > 0 ? (sent / limit) * 100 : 0}%`
                }}
              />
            </div>
            <div className="breakdown-value">{usageAnalyticsService.formatNumber(sent)}</div>
          </div>
          <div className="breakdown-item">
            <div className="breakdown-label">Received Messages</div>
            <div className="breakdown-bar">
              <div 
                className="breakdown-fill received"
                style={{ 
                  width: `${limit > 0 ? (received / limit) * 100 : 0}%`
                }}
              />
            </div>
            <div className="breakdown-value">{usageAnalyticsService.formatNumber(received)}</div>
          </div>
        </div>
      </div>

      <div className="card-footer">
        <div className="footer-stats">
          <div className="footer-stat">
            <span className="footer-label">Daily Avg:</span>
            <span className="footer-value">
              {Math.round(sent / new Date().getDate())}
            </span>
          </div>
          <div className="footer-stat">
            <span className="footer-label">Efficiency:</span>
            <span className="footer-value">
              {totalMessages > 0 ? Math.round((sent / totalMessages) * 100) : 0}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProviderUsageCard;
