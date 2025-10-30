import { useState, useEffect, useCallback } from 'react';
import { usageAnalyticsService, CurrentUsage, MonthlyUsage, ProviderUsage, UsageTrend, UsageReport } from '../services/usageAnalytics.service';
import { useAuth } from '../context/AuthContext';

interface UseUsageAnalyticsOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface UseUsageAnalyticsReturn {
  currentUsage: CurrentUsage | null;
  monthlyUsage: MonthlyUsage[];
  trends: UsageTrend[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
  getProviderUsage: (provider: string, months?: number) => Promise<ProviderUsage>;
  generateReport: (month?: string) => Promise<UsageReport>;
}

export const useUsageAnalytics = ({ 
  autoRefresh = true, 
  refreshInterval = 60000 // 1 minute
}: UseUsageAnalyticsOptions = {}): UseUsageAnalyticsReturn => {
  const { isAuthenticated, token } = useAuth();
  const [currentUsage, setCurrentUsage] = useState<CurrentUsage | null>(null);
  const [monthlyUsage, setMonthlyUsage] = useState<MonthlyUsage[]>([]);
  const [trends, setTrends] = useState<UsageTrend[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [currentData, monthlyData, trendsData] = await Promise.all([
        usageAnalyticsService.getCurrentUsage(),
        usageAnalyticsService.getMonthlyUsage(),
        usageAnalyticsService.getUsageTrends(6)
      ]);

      setCurrentUsage(currentData);
      setMonthlyUsage(monthlyData);
      setTrends(trendsData);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('Failed to fetch usage analytics:', err);
      setError(err.response?.data?.error || 'Failed to load usage analytics');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  const refresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const getProviderUsage = useCallback(async (provider: string, months: number = 1): Promise<ProviderUsage> => {
    try {
      return await usageAnalyticsService.getProviderUsage(provider, months);
    } catch (err: any) {
      console.error(`Failed to fetch ${provider} usage:`, err);
      throw err;
    }
  }, []);

  const generateReport = useCallback(async (month?: string): Promise<UsageReport> => {
    try {
      return await usageAnalyticsService.generateUsageReport(month);
    } catch (err: any) {
      console.error('Failed to generate usage report:', err);
      throw err;
    }
  }, []);

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh && isAuthenticated) {
      fetchData();
      const interval = setInterval(fetchData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, autoRefresh, refreshInterval, isAuthenticated]);

  return {
    currentUsage,
    monthlyUsage,
    trends,
    loading,
    error,
    lastUpdated,
    refresh,
    getProviderUsage,
    generateReport,
  };
};
