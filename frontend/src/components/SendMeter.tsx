import React from 'react';
import { useEmailLimits } from '../hooks/useEmailLimits';
import { emailLimitsService } from '../services/emailLimits.service';
import { useAuth } from '../context/AuthContext';
import './SendMeter.css';

interface SendMeterProps {
  accountId: string;
  onLimitExceeded?: (message: string) => void;
  className?: string;
}

const SendMeter: React.FC<SendMeterProps> = ({ 
  accountId, 
  onLimitExceeded,
  className = '' 
}) => {
  const { isAuthenticated, token } = useAuth();
  const {
    limits,
    loading,
    error,
    lastUpdated,
    refresh,
    canSendEmail,
    remainingEmails
  } = useEmailLimits({ accountId });

  // Don't render if not authenticated
  if (!isAuthenticated || !token) {
    return (
      <div className={`send-meter ${className}`}>
        <div className="send-meter-header">
          <h3>📧 Email Send Meter</h3>
          <div className="auth-help">
            <div className="error-message">❌ Authentication required</div>
            <div className="help-text">
              <p>To view email limits, please:</p>
              <ol>
                <li>Log in to your account</li>
                <li>Or set a test token in localStorage</li>
              </ol>
              <details>
                <summary>🔧 Developer: Set Test Token</summary>
                <div className="token-instructions">
                  <p>1. Open Developer Tools (F12)</p>
                  <p>2. Go to Application → Local Storage</p>
                  <p>3. Add key: <code>authToken</code></p>
                  <p>4. Add value: <code>eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyXzEyMyIsImVtYWlsIjoiZ2FuZXNobXV0aHVrYXJ1cHBhbkBnbWFpbC5jb20iLCJpYXQiOjE3NjE2Njk1MzQsImV4cCI6MTc2MTc1NTkzNH0.8NYB8KYTxWgO2-0-PnwAXIutokX4QbZj5rFrT0RExQQ</code></p>
                  <p>5. Refresh the page</p>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Calculate percentages
  const hourlyPercentage = limits ? (limits.usedHour / limits.perHour) * 100 : 0;
  const dailyPercentage = limits ? (limits.usedDay / limits.perDay) * 100 : 0;

  // Determine status colors
  const hourlyColor = emailLimitsService.getStatusColor(hourlyPercentage);
  const dailyColor = emailLimitsService.getStatusColor(dailyPercentage);

  // Format time remaining
  const formatTimeRemaining = (seconds: number) => {
    return emailLimitsService.formatTimeRemaining(seconds);
  };

  if (loading) {
    return (
      <div className={`send-meter ${className}`}>
        <div className="send-meter-header">
          <h3>📧 Email Send Meter</h3>
          <div className="loading-spinner">Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`send-meter ${className}`}>
        <div className="send-meter-header">
          <h3>📧 Email Send Meter</h3>
          <div className="error-message">❌ {error}</div>
        </div>
      </div>
    );
  }

  if (!limits) {
    return (
      <div className={`send-meter ${className}`}>
        <div className="send-meter-header">
          <h3>📧 Email Send Meter</h3>
          <div className="no-data">No data available</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`send-meter ${className}`}>
      <div className="send-meter-header">
        <h3>📧 Email Send Meter</h3>
        <div className="last-updated">
          {lastUpdated && `Updated: ${lastUpdated.toLocaleTimeString()}`}
        </div>
      </div>

      <div className="limits-container">
        {/* Hourly Limit */}
        <div className="limit-item">
          <div className="limit-header">
            <span className="limit-label">Hourly</span>
            <span className="limit-usage">
              {limits.usedHour}/{limits.perHour}
            </span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ 
                width: `${Math.min(hourlyPercentage, 100)}%`,
                backgroundColor: hourlyColor
              }}
            />
          </div>
          <div className="limit-status">
            <span className={hourlyPercentage >= 90 ? 'warning' : hourlyPercentage >= 100 ? 'error' : ''}>
              {hourlyPercentage >= 100 ? '❌' : hourlyPercentage >= 90 ? '⚠️' : '✅'}
            </span>
          </div>
        </div>

        {/* Daily Limit */}
        <div className="limit-item">
          <div className="limit-header">
            <span className="limit-label">Daily</span>
            <span className="limit-usage">
              {limits.usedDay}/{limits.perDay}
            </span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ 
                width: `${Math.min(dailyPercentage, 100)}%`,
                backgroundColor: dailyColor
              }}
            />
          </div>
          <div className="limit-status">
            <span className={dailyPercentage >= 90 ? 'warning' : dailyPercentage >= 100 ? 'error' : ''}>
              {dailyPercentage >= 100 ? '❌' : dailyPercentage >= 90 ? '⚠️' : '✅'}
            </span>
          </div>
        </div>

        {/* Cooldown Information */}
        <div className="cooldown-info">
          <div className="cooldown-item">
            <span className="cooldown-label">Recipient:</span>
            <span className="cooldown-value">
              {formatTimeRemaining(limits.cooldowns.recipientSec)}
            </span>
          </div>
          <div className="cooldown-item">
            <span className="cooldown-label">Domain:</span>
            <span className="cooldown-value">
              {formatTimeRemaining(limits.cooldowns.domainSec)}
            </span>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="quick-stats">
          <div className="stat-item">
            <span className="stat-label">Today</span>
            <span className="stat-value">
              {remainingEmails.daily}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Hour</span>
            <span className="stat-value">
              {remainingEmails.hourly}
            </span>
          </div>
        </div>

        {/* Send Status */}
        <div className="send-status">
          <div className={`status-indicator ${canSendEmail ? 'can-send' : 'cannot-send'}`}>
            {canSendEmail ? '✅ Ready' : '🚫 Blocked'}
          </div>
        </div>
      </div>

      {/* Refresh Button */}
      <div className="send-meter-footer">
        <button 
          className="refresh-button"
          onClick={refresh}
          disabled={loading}
        >
          🔄 Refresh
        </button>
      </div>
    </div>
  );
};

export default SendMeter;
