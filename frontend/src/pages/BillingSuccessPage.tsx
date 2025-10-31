import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../config/api';
import ProviderOnboardingModal from '../components/ProviderOnboardingModal';

export default function BillingSuccessPage() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [provider, setProvider] = useState<'whatsapp' | 'instagram' | null>(null);
  const [checkingCredentials, setCheckingCredentials] = useState(true);

  useEffect(() => {
    checkOnboardingRequirement();
  }, []);

  const checkOnboardingRequirement = async () => {
    try {
      // Check URL parameters for provider
      const providerParam = searchParams.get('provider') as 'whatsapp' | 'instagram' | null;
      
      // Check if user has credentials
      const credentialsResponse = await api.get('/user/credentials');
      const hasCredentials = credentialsResponse.data.hasCredentials && 
                            credentialsResponse.data.data?.unipile_api_key;

      // Determine if onboarding is needed
      let needsOnboarding = false;
      let onboardingProvider: 'whatsapp' | 'instagram' | null = null;

      // Priority: URL parameter
      if (providerParam && (providerParam === 'whatsapp' || providerParam === 'instagram')) {
        onboardingProvider = providerParam;
        needsOnboarding = !hasCredentials;
      } else {
        // Check subscription to see which provider was just activated
        try {
          const userId = user?.id || 'user_123';
          const subscriptionResponse = await api.get(`/billing/subscription?userId=${userId}`);
          const subscription = subscriptionResponse.data;
          
          // Check entitlements from subscription
          if (subscription?.entitlements) {
            const entitlements = subscription.entitlements;
            if (entitlements.whatsapp && !hasCredentials) {
              onboardingProvider = 'whatsapp';
              needsOnboarding = true;
            } else if (entitlements.instagram && !hasCredentials) {
              onboardingProvider = 'instagram';
              needsOnboarding = true;
            }
          }
        } catch (subError) {
          console.error('Failed to check subscription:', subError);
        }
      }

      if (needsOnboarding && onboardingProvider) {
        setProvider(onboardingProvider);
        setShowOnboardingModal(true);
      }
    } catch (error) {
      console.error('Failed to check onboarding requirement:', error);
    } finally {
      setCheckingCredentials(false);
    }
  };

  const handleCloseModal = () => {
    setShowOnboardingModal(false);
    // Refresh page to update connections
    window.location.href = '/connections';
  };

  return (
    <div style={{ padding: 32, maxWidth: 720, margin: '0 auto' }}>
      <h2>✅ Payment successful</h2>
      <p>Your subscription is now active. Webhooks may take a moment to sync.</p>
      <div style={{ marginTop: 12 }}>
        <Link to="/settings/billing">Back to Billing</Link>
      </div>

      {/* Provider Onboarding Modal */}
      {showOnboardingModal && provider && (
        <ProviderOnboardingModal
          isOpen={showOnboardingModal}
          onClose={handleCloseModal}
          provider={provider}
        />
      )}
    </div>
  );
}



