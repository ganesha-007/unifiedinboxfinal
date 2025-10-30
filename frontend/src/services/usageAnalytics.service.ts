// Usage Analytics Service for Frontend
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export interface MonthlyUsage {
  period: string;
  provider: string;
  sent: number;
  received: number;
  limit: number;
  remaining: number;
  percentage: number;
}

export interface ProviderUsage {
  provider: string;
  totalSent: number;
  totalReceived: number;
  limit: number;
  remaining: number;
  percentage: number;
  accounts: Array<{
    accountId: string;
    accountName: string;
    sent: number;
    received: number;
  }>;
}

export interface UsageTrend {
  month: string;
  sent: number;
  received: number;
  total: number;
}

export interface UsageReport {
  userId: string;
  period: string;
  totalSent: number;
  totalReceived: number;
  totalLimit: number;
  totalRemaining: number;
  providers: ProviderUsage[];
  trends: UsageTrend[];
  summary: {
    mostUsedProvider: string;
    leastUsedProvider: string;
    averageDailyUsage: number;
    daysRemaining: number;
  };
}

export interface CurrentUsage {
  currentMonth: string;
  totals: {
    sent: number;
    received: number;
    limit: number;
    remaining: number;
    percentage: number;
  };
  providers: MonthlyUsage[];
  trends: UsageTrend[];
  alerts: {
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
  };
}

class UsageAnalyticsService {
  private baseURL: string;

  constructor() {
    this.baseURL = API_URL;
  }

  private getAuthHeaders() {
    const token = localStorage.getItem('authToken');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Get current usage summary for dashboard
   */
  async getCurrentUsage(): Promise<CurrentUsage> {
    const response = await axios.get(`${this.baseURL}/usage/current`, {
      headers: this.getAuthHeaders(),
    });
    return response.data.data;
  }

  /**
   * Get monthly usage for all providers
   */
  async getMonthlyUsage(month?: string): Promise<MonthlyUsage[]> {
    const params = month ? { month } : {};
    const response = await axios.get(`${this.baseURL}/usage/monthly`, {
      headers: this.getAuthHeaders(),
      params,
    });
    return response.data.data;
  }

  /**
   * Get usage for a specific provider
   */
  async getProviderUsage(provider: string, months: number = 1): Promise<ProviderUsage> {
    const response = await axios.get(`${this.baseURL}/usage/provider/${provider}`, {
      headers: this.getAuthHeaders(),
      params: { months },
    });
    return response.data.data;
  }

  /**
   * Get usage trends over time
   */
  async getUsageTrends(months: number = 6): Promise<UsageTrend[]> {
    const response = await axios.get(`${this.baseURL}/usage/trends`, {
      headers: this.getAuthHeaders(),
      params: { months },
    });
    return response.data.data;
  }

  /**
   * Generate comprehensive usage report
   */
  async generateUsageReport(month?: string): Promise<UsageReport> {
    const params = month ? { month } : {};
    const response = await axios.get(`${this.baseURL}/usage/report`, {
      headers: this.getAuthHeaders(),
      params,
    });
    return response.data.data;
  }

  /**
   * Get admin usage statistics
   */
  async getAdminUsageStats(months: number = 1): Promise<any> {
    const response = await axios.get(`${this.baseURL}/usage/admin/stats`, {
      headers: this.getAuthHeaders(),
      params: { months },
    });
    return response.data.data;
  }

  /**
   * Format percentage for display
   */
  formatPercentage(percentage: number): string {
    return `${Math.round(percentage * 100) / 100}%`;
  }

  /**
   * Format number with commas
   */
  formatNumber(num: number): string {
    return num.toLocaleString();
  }

  /**
   * Get status color based on usage percentage
   */
  getStatusColor(percentage: number): string {
    if (percentage >= 100) return '#ef4444'; // Red
    if (percentage >= 90) return '#f59e0b'; // Yellow
    if (percentage >= 75) return '#3b82f6'; // Blue
    return '#10b981'; // Green
  }

  /**
   * Get status message based on usage percentage
   */
  getStatusMessage(percentage: number): string {
    if (percentage >= 100) return 'Limit exceeded';
    if (percentage >= 90) return 'Approaching limit';
    if (percentage >= 75) return 'High usage';
    return 'Normal usage';
  }

  /**
   * Format month for display
   */
  formatMonth(period: string): string {
    const [year, month] = period.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  }

  /**
   * Get provider display name
   */
  getProviderDisplayName(provider: string): string {
    const names: { [key: string]: string } = {
      whatsapp: 'WhatsApp',
      instagram: 'Instagram',
      email: 'Gmail',
      outlook: 'Outlook',
    };
    return names[provider] || provider;
  }

  /**
   * Get provider icon
   */
  getProviderIcon(provider: string): string {
    const icons: { [key: string]: string } = {
      whatsapp: '💬',
      instagram: '📷',
      email: '📧',
      outlook: '📮',
    };
    return icons[provider] || '📱';
  }
}

export const usageAnalyticsService = new UsageAnalyticsService();
