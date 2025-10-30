// Email Limits Service
export interface EmailLimits {
  perHour: number;
  usedHour: number;
  perDay: number;
  usedDay: number;
  cooldowns: {
    recipientSec: number;
    domainSec: number;
  };
}

export interface EmailLimitsResponse {
  success: boolean;
  limits: EmailLimits;
  remaining: {
    hour: number;
    day: number;
  };
}

class EmailLimitsService {
  private baseURL: string;

  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || '/api';
  }

  /**
   * Get email limits for a specific account
   */
  async getLimits(accountId: string): Promise<EmailLimitsResponse> {
    const token = localStorage.getItem('authToken');
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch(`${this.baseURL}/channels/email/${accountId}/limits`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication failed. Please log in again.');
      }
      if (response.status === 404) {
        throw new Error('Account not found');
      }
      throw new Error(`Failed to fetch email limits: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Check if user can send email based on current limits
   */
  async canSendEmail(accountId: string): Promise<{
    canSend: boolean;
    reason?: string;
    limits: EmailLimits;
  }> {
    try {
      const data = await this.getLimits(accountId);
      const { limits } = data;

      // Check hourly limit
      if (limits.usedHour >= limits.perHour) {
        return {
          canSend: false,
          reason: 'Hourly email limit reached. Please wait before sending more emails.',
          limits
        };
      }

      // Check daily limit
      if (limits.usedDay >= limits.perDay) {
        return {
          canSend: false,
          reason: 'Daily email limit reached. Please try again tomorrow.',
          limits
        };
      }

      return {
        canSend: true,
        limits
      };
    } catch (error: any) {
      console.error('Error checking email limits:', error);
      return {
        canSend: false,
        reason: `Error checking limits: ${error.message}`,
        limits: {
          perHour: 50,
          usedHour: 0,
          perDay: 200,
          usedDay: 0,
          cooldowns: {
            recipientSec: 120,
            domainSec: 60
          }
        }
      };
    }
  }

  /**
   * Get remaining emails for today
   */
  async getRemainingEmails(accountId: string): Promise<{
    hourly: number;
    daily: number;
  }> {
    try {
      const data = await this.getLimits(accountId);
      return {
        hourly: Math.max(0, data.limits.perHour - data.limits.usedHour),
        daily: Math.max(0, data.limits.perDay - data.limits.usedDay)
      };
    } catch (error) {
      console.error('Error getting remaining emails:', error);
      return {
        hourly: 0,
        daily: 0
      };
    }
  }

  /**
   * Format time remaining for display
   */
  formatTimeRemaining(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes < 60) {
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  /**
   * Get status color based on usage percentage
   */
  getStatusColor(percentage: number): string {
    if (percentage >= 100) return '#ff4444'; // Red - exceeded
    if (percentage >= 90) return '#ff6b6b'; // Light red - critical
    if (percentage >= 75) return '#ffaa00'; // Orange - warning
    if (percentage >= 50) return '#ffdd00'; // Yellow - caution
    return '#44ff44'; // Green - good
  }

  /**
   * Get status message based on usage
   */
  getStatusMessage(percentage: number, type: 'hourly' | 'daily'): string {
    if (percentage >= 100) {
      return `🚫 ${type.charAt(0).toUpperCase() + type.slice(1)} limit exceeded!`;
    }
    if (percentage >= 90) {
      return `⚠️ Approaching ${type} limit!`;
    }
    if (percentage >= 75) {
      return `⚡ ${type.charAt(0).toUpperCase() + type.slice(1)} usage is high`;
    }
    return `✅ ${type.charAt(0).toUpperCase() + type.slice(1)} usage is normal`;
  }
}

export const emailLimitsService = new EmailLimitsService();
