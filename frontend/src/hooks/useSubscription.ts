import { useState, useEffect, useCallback } from 'react';
import { getSubscription } from '../services/billing.service';
import { useAuth } from '../context/AuthContext';

export interface Subscription {
  id: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete';
  planCode: string;
  planName: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  trialEnd?: string;
  addons: Array<{
    code: string;
    name: string;
    active: boolean;
  }>;
  entitlements: {
    whatsapp: boolean;
    instagram: boolean;
    email: boolean;
    maxAccounts: number;
    maxMessages: number;
  };
}

export interface UseSubscriptionReturn {
  subscription: Subscription | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  hasFeature: (feature: string) => boolean;
  canUseFeature: (feature: string, currentUsage?: number) => boolean;
  getFeatureLimit: (feature: string) => number;
  isTrialing: boolean;
  isPastDue: boolean;
  needsUpgrade: boolean;
}

export const useSubscription = (): UseSubscriptionReturn => {
  const { user, isAuthenticated } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscription = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const data = await getSubscription(user.id);
      
      // Transform backend data to frontend format
      const transformedSubscription: Subscription = {
        id: data.subscription?.id || 'free',
        status: data.subscription?.status || 'active',
        planCode: data.planCode || 'starter',
        planName: data.planName || 'Starter',
        currentPeriodStart: data.subscription?.currentPeriodStart || new Date().toISOString(),
        currentPeriodEnd: data.subscription?.currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        cancelAtPeriodEnd: data.subscription?.cancelAtPeriodEnd || false,
        trialEnd: data.subscription?.trialEnd,
        addons: data.addons || [],
        entitlements: {
          whatsapp: data.entitlements?.whatsapp || false,
          instagram: data.entitlements?.instagram || false,
          email: data.entitlements?.email || true, // Email is available on all plans
          maxAccounts: getMaxAccounts(data.planCode || 'starter'),
          maxMessages: getMaxMessages(data.planCode || 'starter')
        }
      };

      setSubscription(transformedSubscription);
    } catch (err: any) {
      console.error('Failed to fetch subscription:', err);
      setError(err.message || 'Failed to load subscription');
      
      // Set default free subscription on error
      setSubscription({
        id: 'free',
        status: 'active',
        planCode: 'starter',
        planName: 'Starter',
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        cancelAtPeriodEnd: false,
        addons: [],
        entitlements: {
          whatsapp: false,
          instagram: false,
          email: true,
          maxAccounts: 1,
          maxMessages: 100
        }
      });
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const hasFeature = useCallback((feature: string): boolean => {
    if (!subscription) return false;
    
    switch (feature) {
      case 'whatsapp':
        return subscription.entitlements.whatsapp;
      case 'instagram':
        return subscription.entitlements.instagram;
      case 'email':
        return subscription.entitlements.email;
      case 'multiple_accounts':
        return subscription.entitlements.maxAccounts > 1;
      case 'unlimited_messages':
        return subscription.entitlements.maxMessages === -1;
      default:
        return false;
    }
  }, [subscription]);

  const canUseFeature = useCallback((feature: string, currentUsage: number = 0): boolean => {
    if (!hasFeature(feature)) return false;
    
    const limit = getFeatureLimit(feature);
    if (limit === -1) return true; // Unlimited
    
    return currentUsage < limit;
  }, [hasFeature]);

  const getFeatureLimit = useCallback((feature: string): number => {
    if (!subscription) return 0;
    
    switch (feature) {
      case 'accounts':
        return subscription.entitlements.maxAccounts;
      case 'messages':
        return subscription.entitlements.maxMessages;
      default:
        return 0;
    }
  }, [subscription]);

  const refresh = useCallback(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  return {
    subscription,
    loading,
    error,
    refresh,
    hasFeature,
    canUseFeature,
    getFeatureLimit,
    isTrialing: subscription?.status === 'trialing',
    isPastDue: subscription?.status === 'past_due',
    needsUpgrade: subscription?.planCode === 'starter' && subscription?.status === 'active'
  };
};

// Helper functions
function getMaxAccounts(planCode: string): number {
  switch (planCode) {
    case 'starter': return 1;
    case 'growth': return 5;
    case 'scale': return -1; // Unlimited
    default: return 1;
  }
}

function getMaxMessages(planCode: string): number {
  switch (planCode) {
    case 'starter': return 1000;
    case 'growth': return 10000;
    case 'scale': return -1; // Unlimited
    default: return 100;
  }
}
