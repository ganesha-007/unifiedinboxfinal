import React from 'react';
import { UsageTrend } from '../services/usageAnalytics.service';
import { usageAnalyticsService } from '../services/usageAnalytics.service';
import './UsageTrends.css';

interface UsageTrendsProps {
  trends: UsageTrend[];
}

const UsageTrends: React.FC<UsageTrendsProps> = ({ trends }) => {
  if (!trends || trends.length === 0) {
    return (
      <div className="usage-trends">
        <div className="no-data">
          <span className="no-data-icon">📊</span>
          <p>No trend data available</p>
        </div>
      </div>
    );
  }

  const maxValue = Math.max(...trends.map(trend => trend.total));
  const maxSent = Math.max(...trends.map(trend => trend.sent));
  const maxReceived = Math.max(...trends.map(trend => trend.received));

  return (
    <div className="usage-trends">
      <div className="trends-header">
        <h3>📈 Usage Trends</h3>
        <div className="trends-period">
          Last {trends.length} months
        </div>
      </div>

      <div className="trends-chart">
        <div className="chart-container">
          <div className="chart-bars">
            {trends.map((trend, index) => {
              const totalHeight = (trend.total / maxValue) * 100;
              const sentHeight = (trend.sent / maxSent) * 100;
              const receivedHeight = (trend.received / maxReceived) * 100;
              
              return (
                <div key={index} className="chart-bar-group">
                  <div className="bar-container">
                    <div 
                      className="bar total"
                      style={{ height: `${totalHeight}%` }}
                      title={`Total: ${usageAnalyticsService.formatNumber(trend.total)} messages`}
                    />
                    <div 
                      className="bar sent"
                      style={{ height: `${sentHeight}%` }}
                      title={`Sent: ${usageAnalyticsService.formatNumber(trend.sent)} messages`}
                    />
                    <div 
                      className="bar received"
                      style={{ height: `${receivedHeight}%` }}
                      title={`Received: ${usageAnalyticsService.formatNumber(trend.received)} messages`}
                    />
                  </div>
                  <div className="bar-label">
                    {usageAnalyticsService.formatMonth(trend.month)}
                  </div>
                  <div className="bar-values">
                    <div className="value-item">
                      <span className="value-dot sent"></span>
                      <span className="value-text">
                        {usageAnalyticsService.formatNumber(trend.sent)}
                      </span>
                    </div>
                    <div className="value-item">
                      <span className="value-dot received"></span>
                      <span className="value-text">
                        {usageAnalyticsService.formatNumber(trend.received)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="trends-summary">
        <div className="summary-item">
          <span className="summary-label">Peak Month:</span>
          <span className="summary-value">
            {usageAnalyticsService.formatMonth(
              trends.reduce((max, trend) => 
                trend.total > max.total ? trend : max
              ).month
            )}
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Average Monthly:</span>
          <span className="summary-value">
            {usageAnalyticsService.formatNumber(
              Math.round(trends.reduce((sum, trend) => sum + trend.total, 0) / trends.length)
            )}
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Growth Rate:</span>
          <span className="summary-value">
            {trends.length > 1 ? 
              `${Math.round(((trends[trends.length - 1].total - trends[0].total) / trends[0].total) * 100)}%` :
              'N/A'
            }
          </span>
        </div>
      </div>

      <div className="trends-legend">
        <div className="legend-item">
          <span className="legend-dot sent"></span>
          <span className="legend-label">Sent Messages</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot received"></span>
          <span className="legend-label">Received Messages</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot total"></span>
          <span className="legend-label">Total Messages</span>
        </div>
      </div>
    </div>
  );
};

export default UsageTrends;
