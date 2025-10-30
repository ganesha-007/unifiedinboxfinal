import React from 'react';
import { MonthlyUsage, UsageTrend } from '../services/usageAnalytics.service';
import { usageAnalyticsService } from '../services/usageAnalytics.service';
import './UsageChart.css';

interface UsageChartProps {
  monthlyUsage: MonthlyUsage[];
  trends: UsageTrend[];
}

const UsageChart: React.FC<UsageChartProps> = ({ monthlyUsage, trends }) => {
  if (!monthlyUsage || monthlyUsage.length === 0) {
    return (
      <div className="usage-chart">
        <div className="no-data">
          <span className="no-data-icon">📊</span>
          <p>No chart data available</p>
        </div>
      </div>
    );
  }

  const totalSent = monthlyUsage.reduce((sum, usage) => sum + usage.sent, 0);
  const totalReceived = monthlyUsage.reduce((sum, usage) => sum + usage.received, 0);
  const totalLimit = monthlyUsage.reduce((sum, usage) => sum + usage.limit, 0);

  return (
    <div className="usage-chart">
      <div className="chart-header">
        <h3>📊 Usage Breakdown</h3>
        <div className="chart-stats">
          <div className="stat-item">
            <span className="stat-label">Total Sent:</span>
            <span className="stat-value">{usageAnalyticsService.formatNumber(totalSent)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Total Received:</span>
            <span className="stat-value">{usageAnalyticsService.formatNumber(totalReceived)}</span>
          </div>
        </div>
      </div>

      <div className="chart-content">
        {/* Provider Usage Bars */}
        <div className="provider-bars">
          {monthlyUsage.map((usage) => {
            const percentage = (usage.sent / usage.limit) * 100;
            const statusColor = usageAnalyticsService.getStatusColor(percentage);
            
            return (
              <div key={usage.provider} className="provider-bar">
                <div className="bar-header">
                  <div className="provider-info">
                    <span className="provider-icon">
                      {usageAnalyticsService.getProviderIcon(usage.provider)}
                    </span>
                    <span className="provider-name">
                      {usageAnalyticsService.getProviderDisplayName(usage.provider)}
                    </span>
                  </div>
                  <div className="bar-stats">
                    <span className="sent-count">{usageAnalyticsService.formatNumber(usage.sent)}</span>
                    <span className="limit-count">/ {usageAnalyticsService.formatNumber(usage.limit)}</span>
                    <span className="percentage">{usageAnalyticsService.formatPercentage(percentage)}</span>
                  </div>
                </div>
                <div className="bar-container">
                  <div 
                    className="bar-fill"
                    style={{ 
                      width: `${Math.min(percentage, 100)}%`,
                      backgroundColor: statusColor
                    }}
                  />
                </div>
                <div className="bar-details">
                  <div className="detail-item">
                    <span className="detail-label">Sent:</span>
                    <span className="detail-value">{usageAnalyticsService.formatNumber(usage.sent)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Received:</span>
                    <span className="detail-value">{usageAnalyticsService.formatNumber(usage.received)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Remaining:</span>
                    <span className="detail-value">{usageAnalyticsService.formatNumber(usage.remaining)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Usage Distribution Pie Chart */}
        <div className="pie-chart-section">
          <h4>Usage Distribution</h4>
          <div className="pie-chart">
            <div className="pie-chart-container">
              {monthlyUsage.map((usage, index) => {
                const percentage = (usage.sent / totalSent) * 100;
                const rotation = monthlyUsage
                  .slice(0, index)
                  .reduce((sum, u) => sum + (u.sent / totalSent) * 360, 0);
                
                return (
                  <div
                    key={usage.provider}
                    className="pie-segment"
                    style={{
                      '--percentage': percentage,
                      '--rotation': rotation,
                      '--color': usageAnalyticsService.getStatusColor(percentage)
                    } as React.CSSProperties}
                    title={`${usageAnalyticsService.getProviderDisplayName(usage.provider)}: ${usageAnalyticsService.formatPercentage(percentage)}`}
                  />
                );
              })}
            </div>
            <div className="pie-legend">
              {monthlyUsage.map((usage) => {
                const percentage = (usage.sent / totalSent) * 100;
                return (
                  <div key={usage.provider} className="legend-item">
                    <span 
                      className="legend-color"
                      style={{ 
                        backgroundColor: usageAnalyticsService.getStatusColor(percentage)
                      }}
                    />
                    <span className="legend-label">
                      {usageAnalyticsService.getProviderDisplayName(usage.provider)}
                    </span>
                    <span className="legend-value">
                      {usageAnalyticsService.formatPercentage(percentage)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UsageChart;
