import React from 'react';
import { usageAnalyticsService } from '../services/usageAnalytics.service';
import './UsageAlerts.css';

interface UsageAlertsProps {
  approachingLimits: Array<{
    provider: string;
    percentage: number;
    remaining: number;
  }>;
  exceededLimits: Array<{
    provider: string;
    percentage: number;
    overage: number;
  }>;
}

const UsageAlerts: React.FC<UsageAlertsProps> = ({ 
  approachingLimits, 
  exceededLimits 
}) => {
  if (approachingLimits.length === 0 && exceededLimits.length === 0) {
    return null;
  }

  return (
    <div className="usage-alerts">
      <h2>🚨 Usage Alerts</h2>
      
      {exceededLimits.length > 0 && (
        <div className="alert-section">
          <h3 className="alert-title critical">❌ Limits Exceeded</h3>
          <div className="alert-list">
            {exceededLimits.map((alert, index) => (
              <div key={index} className="alert-item critical">
                <div className="alert-icon">🚫</div>
                <div className="alert-content">
                  <div className="alert-provider">
                    {usageAnalyticsService.getProviderIcon(alert.provider)}
                    {usageAnalyticsService.getProviderDisplayName(alert.provider)}
                  </div>
                  <div className="alert-message">
                    Exceeded limit by {usageAnalyticsService.formatNumber(alert.overage)} messages
                  </div>
                  <div className="alert-details">
                    {usageAnalyticsService.formatPercentage(alert.percentage)} usage
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {approachingLimits.length > 0 && (
        <div className="alert-section">
          <h3 className="alert-title warning">⚠️ Approaching Limits</h3>
          <div className="alert-list">
            {approachingLimits.map((alert, index) => (
              <div key={index} className="alert-item warning">
                <div className="alert-icon">⚠️</div>
                <div className="alert-content">
                  <div className="alert-provider">
                    {usageAnalyticsService.getProviderIcon(alert.provider)}
                    {usageAnalyticsService.getProviderDisplayName(alert.provider)}
                  </div>
                  <div className="alert-message">
                    {usageAnalyticsService.formatNumber(alert.remaining)} messages remaining
                  </div>
                  <div className="alert-details">
                    {usageAnalyticsService.formatPercentage(alert.percentage)} usage
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="alert-actions">
        <button className="action-button primary">
          📊 View Detailed Analytics
        </button>
        <button className="action-button secondary">
          📧 Contact Support
        </button>
      </div>
    </div>
  );
};

export default UsageAlerts;
