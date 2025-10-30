import React, { ReactNode } from 'react';
import { useSubscription } from '../hooks/useSubscription';
import UpgradeModal from './UpgradeModal';
import './FeatureGuard.css';

interface FeatureGuardProps {
  feature: string;
  fallback?: ReactNode;
  showUpgradeModal?: boolean;
  children: ReactNode;
  currentUsage?: number;
  customMessage?: string;
}

const FeatureGuard: React.FC<FeatureGuardProps> = ({
  feature,
  fallback,
  showUpgradeModal = true,
  children,
  currentUsage = 0,
  customMessage
}) => {
  const { hasFeature, canUseFeature, subscription, loading } = useSubscription();
  const [showModal, setShowModal] = React.useState(false);

  if (loading) {
    return (
      <div className="feature-guard-loading">
        <div className="loading-spinner"></div>
        <span>Checking access...</span>
      </div>
    );
  }

  const hasAccess = hasFeature(feature);
  const canUse = canUseFeature(feature, currentUsage);

  if (hasAccess && canUse) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  const getFeatureDisplayName = (feature: string): string => {
    switch (feature) {
      case 'whatsapp': return 'WhatsApp Integration';
      case 'instagram': return 'Instagram Integration';
      case 'email': return 'Email Integration';
      case 'multiple_accounts': return 'Multiple Accounts';
      case 'unlimited_messages': return 'Unlimited Messages';
      default: return feature;
    }
  };

  const getUpgradeReason = (): string => {
    if (customMessage) return customMessage;
    
    if (!hasAccess) {
      return `${getFeatureDisplayName(feature)} is not available on your current plan.`;
    }
    
    if (!canUse) {
      return `You've reached the limit for ${getFeatureDisplayName(feature)} on your current plan.`;
    }
    
    return `This feature requires an upgrade.`;
  };

  const getRequiredPlan = (): string => {
    switch (feature) {
      case 'whatsapp':
      case 'instagram':
        return 'Growth';
      case 'multiple_accounts':
        return 'Growth';
      case 'unlimited_messages':
        return 'Scale';
      default:
        return 'Growth';
    }
  };

  return (
    <div className="feature-guard-blocked">
      <div className="feature-guard-content">
        <div className="feature-guard-icon">🔒</div>
        <h3>Feature Locked</h3>
        <p>{getUpgradeReason()}</p>
        <div className="feature-guard-actions">
          {showUpgradeModal && (
            <button 
              className="btn-upgrade"
              onClick={() => setShowModal(true)}
            >
              Upgrade to {getRequiredPlan()}
            </button>
          )}
          <div className="current-plan">
            Current plan: <strong>{subscription?.planName || 'Starter'}</strong>
          </div>
        </div>
      </div>

      {showModal && (
        <UpgradeModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          feature={feature}
          reason={getUpgradeReason()}
          recommendedPlan={getRequiredPlan().toLowerCase() as 'growth' | 'scale'}
        />
      )}

    </div>
  );
};

export default FeatureGuard;
