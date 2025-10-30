import React, { useState, useEffect } from 'react';
import { useUsageAnalytics } from '../hooks/useUsageAnalytics';
import { usageAnalyticsService } from '../services/usageAnalytics.service';
import UsageSummary from '../components/UsageSummary';
import UsageChart from '../components/UsageChart';
import ProviderUsageCard from '../components/ProviderUsageCard';
import UsageAlerts from '../components/UsageAlerts';
import UsageTrends from '../components/UsageTrends';
import './UsageAnalyticsPage.css';

const UsageAnalyticsPage: React.FC = () => {
  const {
    currentUsage,
    monthlyUsage,
    trends,
    loading,
    error,
    lastUpdated,
    refresh,
    generateReport
  } = useUsageAnalytics();

  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [showReport, setShowReport] = useState<boolean>(false);
  const [reportData, setReportData] = useState<any>(null);

  // Enable scrolling for analytics page
  useEffect(() => {
    document.body.classList.add('analytics-page');
    const rootElement = document.getElementById('root');
    if (rootElement) {
      rootElement.classList.add('analytics-page');
    }

    // Cleanup on unmount
    return () => {
      document.body.classList.remove('analytics-page');
      if (rootElement) {
        rootElement.classList.remove('analytics-page');
      }
    };
  }, []);

  const handleGenerateReport = async () => {
    try {
      const report = await generateReport(selectedMonth || undefined);
      setReportData(report);
      setShowReport(true);
    } catch (err) {
      console.error('Failed to generate report:', err);
    }
  };

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
  };

  if (loading && !currentUsage) {
    return (
      <div className="usage-analytics-page">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading usage analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="usage-analytics-page">
        <div className="error-container">
          <h2>❌ Error Loading Analytics</h2>
          <p>{error}</p>
          <button onClick={refresh} className="retry-button">
            🔄 Retry
          </button>
        </div>
      </div>
    );
  }

  if (!currentUsage) {
    return (
      <div className="usage-analytics-page">
        <div className="no-data-container">
          <h2>📊 No Usage Data Available</h2>
          <p>Start sending messages to see your usage analytics.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="usage-analytics-page">
      {/* Header */}
      <div className="analytics-header">
        <div className="header-content">
          <h1>📊 Usage Analytics</h1>
          <div className="header-actions">
            <div className="last-updated">
              {lastUpdated && `Last updated: ${lastUpdated.toLocaleTimeString()}`}
            </div>
            <button onClick={refresh} className="refresh-button" disabled={loading}>
              {loading ? '🔄' : '🔄'} Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Usage Summary */}
      <div className="analytics-section">
        <UsageSummary 
          totals={currentUsage.totals}
          currentMonth={currentUsage.currentMonth}
        />
      </div>

      {/* Usage Alerts */}
      {(currentUsage.alerts.approachingLimits.length > 0 || currentUsage.alerts.exceededLimits.length > 0) && (
        <div className="analytics-section">
          <UsageAlerts 
            approachingLimits={currentUsage.alerts.approachingLimits}
            exceededLimits={currentUsage.alerts.exceededLimits}
          />
        </div>
      )}

      {/* Provider Usage Cards */}
      <div className="analytics-section">
        <h2>Provider Usage</h2>
        <div className="provider-cards-grid">
          {monthlyUsage.map((usage) => (
            <ProviderUsageCard 
              key={usage.provider}
              usage={usage}
            />
          ))}
        </div>
      </div>

      {/* Usage Trends Chart */}
      <div className="analytics-section">
        <h2>Usage Trends</h2>
        <UsageTrends trends={trends} />
      </div>

      {/* Usage Chart */}
      <div className="analytics-section">
        <h2>Monthly Usage Breakdown</h2>
        <UsageChart 
          monthlyUsage={monthlyUsage}
          trends={trends}
        />
      </div>

      {/* Report Generation */}
      <div className="analytics-section">
        <h2>Usage Reports</h2>
        <div className="report-controls">
          <div className="month-selector">
            <label htmlFor="month-select">Select Month:</label>
            <select 
              id="month-select"
              value={selectedMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
            >
              <option value="">Current Month</option>
              <option value="2025-09">September 2025</option>
              <option value="2025-08">August 2025</option>
              <option value="2025-07">July 2025</option>
            </select>
          </div>
          <button 
            onClick={handleGenerateReport}
            className="generate-report-button"
          >
            📄 Generate Report
          </button>
        </div>
      </div>

      {/* Report Modal */}
      {showReport && reportData && (
        <div className="report-modal-overlay" onClick={() => setShowReport(false)}>
          <div className="report-modal" onClick={(e) => e.stopPropagation()}>
            <div className="report-modal-header">
              <h3>📊 Usage Report - {reportData.period}</h3>
              <button 
                className="close-button"
                onClick={() => setShowReport(false)}
              >
                ✕
              </button>
            </div>
            <div className="report-modal-content">
              <div className="report-summary">
                <h4>Summary</h4>
                <div className="report-stats">
                  <div className="stat-item">
                    <span className="stat-label">Total Sent:</span>
                    <span className="stat-value">{reportData.totalSent.toLocaleString()}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Total Received:</span>
                    <span className="stat-value">{reportData.totalReceived.toLocaleString()}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Total Limit:</span>
                    <span className="stat-value">{reportData.totalLimit.toLocaleString()}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Remaining:</span>
                    <span className="stat-value">{reportData.totalRemaining.toLocaleString()}</span>
                  </div>
                </div>
              </div>
              
              <div className="report-insights">
                <h4>Insights</h4>
                <div className="insights-grid">
                  <div className="insight-item">
                    <span className="insight-label">Most Used:</span>
                    <span className="insight-value">{reportData.summary.mostUsedProvider}</span>
                  </div>
                  <div className="insight-item">
                    <span className="insight-label">Least Used:</span>
                    <span className="insight-value">{reportData.summary.leastUsedProvider}</span>
                  </div>
                  <div className="insight-item">
                    <span className="insight-label">Daily Average:</span>
                    <span className="insight-value">{reportData.summary.averageDailyUsage.toFixed(1)} messages</span>
                  </div>
                  <div className="insight-item">
                    <span className="insight-label">Days Remaining:</span>
                    <span className="insight-value">{reportData.summary.daysRemaining} days</span>
                  </div>
                </div>
              </div>

              <div className="report-providers">
                <h4>Provider Breakdown</h4>
                <div className="providers-list">
                  {reportData.providers.map((provider: any) => (
                    <div key={provider.provider} className="provider-report-item">
                      <div className="provider-name">
                        {usageAnalyticsService.getProviderIcon(provider.provider)} 
                        {usageAnalyticsService.getProviderDisplayName(provider.provider)}
                      </div>
                      <div className="provider-stats">
                        <span>{provider.totalSent} sent</span>
                        <span>{provider.totalReceived} received</span>
                        <span>{provider.percentage.toFixed(1)}% used</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsageAnalyticsPage;
