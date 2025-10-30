import { useState, useEffect, useCallback } from 'react';
import { emailLimitsService, EmailLimits } from '../services/emailLimits.service';

interface UseEmailLimitsOptions {
  accountId: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface UseEmailLimitsReturn {
  limits: EmailLimits | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
  canSendEmail: boolean;
  remainingEmails: {
    hourly: number;
    daily: number;
  };
  statusMessage: {
    hourly: string;
    daily: string;
  };
}

export const useEmailLimits = ({
  accountId,
  autoRefresh = true,
  refreshInterval = 30000 // 30 seconds
}: UseEmailLimitsOptions): UseEmailLimitsReturn => {
  const [limits, setLimits] = useState<EmailLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchLimits = useCallback(async () => {
    if (!accountId) return;

    try {
      setLoading(true);
      setError(null);
      
      const data = await emailLimitsService.getLimits(accountId);
      setLimits(data.limits);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('Error fetching email limits:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh && accountId) {
      fetchLimits();
      const interval = setInterval(fetchLimits, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [accountId, autoRefresh, refreshInterval, fetchLimits]);

  // Calculate derived values
  const canSendEmail = limits ? 
    limits.usedHour < limits.perHour && limits.usedDay < limits.perDay : 
    false;

  const remainingEmails = limits ? {
    hourly: Math.max(0, limits.perHour - limits.usedHour),
    daily: Math.max(0, limits.perDay - limits.usedDay)
  } : {
    hourly: 0,
    daily: 0
  };

  const statusMessage = limits ? {
    hourly: emailLimitsService.getStatusMessage(
      (limits.usedHour / limits.perHour) * 100, 
      'hourly'
    ),
    daily: emailLimitsService.getStatusMessage(
      (limits.usedDay / limits.perDay) * 100, 
      'daily'
    )
  } : {
    hourly: 'No data available',
    daily: 'No data available'
  };

  return {
    limits,
    loading,
    error,
    lastUpdated,
    refresh: fetchLimits,
    canSendEmail,
    remainingEmails,
    statusMessage
  };
};
