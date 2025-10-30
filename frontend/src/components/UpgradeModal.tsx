import React, { useState } from 'react';
import { createCheckoutSession } from '../services/billing.service';
import { useAuth } from '../context/AuthContext';
import PlanComparison from './PlanComparison';
import './UpgradeModal.css';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature?: string;
  reason?: string;
  recommendedPlan?: 'growth' | 'scale';
  showPlanComparison?: boolean;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
  feature,
  reason,
  recommendedPlan = 'growth',
  showPlanComparison = true
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'growth' | 'scale'>(recommendedPlan);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(showPlanComparison);

  if (!isOpen) return null;

  const handleUpgrade = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      
      const planPriceId = selectedPlan === 'growth' 
        ? process.env.REACT_APP_GROWTH_PRICE_ID 
        : process.env.REACT_APP_SCALE_PRICE_ID;

      const addonPriceIds: string[] = [];
      if (selectedAddons.includes('whatsapp') && process.env.REACT_APP_ADDON_WHATSAPP_PRICE_ID) {
        addonPriceIds.push(process.env.REACT_APP_ADDON_WHATSAPP_PRICE_ID);
      }
      if (selectedAddons.includes('instagram') && process.env.REACT_APP_ADDON_INSTAGRAM_PRICE_ID) {
        addonPriceIds.push(process.env.REACT_APP_ADDON_INSTAGRAM_PRICE_ID);
      }
      if (selectedAddons.includes('email') && process.env.REACT_APP_ADDON_EMAIL_PRICE_ID) {
        addonPriceIds.push(process.env.REACT_APP_ADDON_EMAIL_PRICE_ID);
      }

      const priceIds = [planPriceId, ...addonPriceIds].filter(Boolean) as string[];
      
      const response = await createCheckoutSession(user.id, priceIds);
      window.location.href = response.url;
    } catch (error) {
      console.error('Failed to create checkout session:', error);
      alert('Failed to start upgrade process. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getFeatureIcon = (feature?: string): string => {
    switch (feature) {
      case 'whatsapp': return '💬';
      case 'instagram': return '📸';
      case 'email': return '📧';
      case 'multiple_accounts': return '👥';
      case 'unlimited_messages': return '🚀';
      default: return '⭐';
    }
  };

  const getPlanPrice = (plan: 'growth' | 'scale'): string => {
    return plan === 'growth' ? '$29/month' : '$99/month';
  };

  const getPlanFeatures = (plan: 'growth' | 'scale'): string[] => {
    if (plan === 'growth') {
      return [
        'Up to 5 accounts',
        '10,000 messages/month',
        'WhatsApp & Instagram',
        'Email support',
        'Basic analytics'
      ];
    } else {
      return [
        'Unlimited accounts',
        'Unlimited messages',
        'All integrations',
        'Priority support',
        'Advanced analytics',
        'Custom integrations'
      ];
    }
  };

  const toggleAddon = (addon: string) => {
    setSelectedAddons(prev => 
      prev.includes(addon) 
        ? prev.filter(a => a !== addon)
        : [...prev, addon]
    );
  };

  return (
    <div className="upgrade-modal-overlay" onClick={onClose}>
      <div className="upgrade-modal" onClick={e => e.stopPropagation()}>
        <div className="upgrade-modal-header">
          <button className="close-button" onClick={onClose}>×</button>
          <div className="upgrade-modal-title">
            <span className="feature-icon">{getFeatureIcon(feature)}</span>
            <h2>Upgrade Your Plan</h2>
          </div>
          {reason && <p className="upgrade-reason">{reason}</p>}
        </div>

        <div className="upgrade-modal-content">
          {showComparison ? (
            <div className="upgrade-options">
              <div className="plan-toggle">
                <button 
                  className={`plan-toggle-btn ${selectedPlan === 'growth' ? 'active' : ''}`}
                  onClick={() => setSelectedPlan('growth')}
                >
                  Growth Plan
                </button>
                <button 
                  className={`plan-toggle-btn ${selectedPlan === 'scale' ? 'active' : ''}`}
                  onClick={() => setSelectedPlan('scale')}
                >
                  Scale Plan
                </button>
              </div>

              <div className="selected-plan-details">
                <div className="plan-header">
                  <h3>{selectedPlan === 'growth' ? 'Growth' : 'Scale'} Plan</h3>
                  <div className="plan-price">{getPlanPrice(selectedPlan)}</div>
                </div>
                
                <div className="plan-features">
                  {getPlanFeatures(selectedPlan).map((feature, index) => (
                    <div key={index} className="feature-item">
                      <span className="feature-check">✓</span>
                      {feature}
                    </div>
                  ))}
                </div>
              </div>

              <div className="addons-section">
                <h4>Add-ons (Optional)</h4>
                <div className="addons-grid">
                  <label className="addon-item">
                    <input
                      type="checkbox"
                      checked={selectedAddons.includes('whatsapp')}
                      onChange={() => toggleAddon('whatsapp')}
                    />
                    <div className="addon-content">
                      <span className="addon-icon">💬</span>
                      <div>
                        <div className="addon-name">WhatsApp Pro</div>
                        <div className="addon-price">+$10/month</div>
                      </div>
                    </div>
                  </label>

                  <label className="addon-item">
                    <input
                      type="checkbox"
                      checked={selectedAddons.includes('instagram')}
                      onChange={() => toggleAddon('instagram')}
                    />
                    <div className="addon-content">
                      <span className="addon-icon">📸</span>
                      <div>
                        <div className="addon-name">Instagram Pro</div>
                        <div className="addon-price">+$10/month</div>
                      </div>
                    </div>
                  </label>

                  <label className="addon-item">
                    <input
                      type="checkbox"
                      checked={selectedAddons.includes('email')}
                      onChange={() => toggleAddon('email')}
                    />
                    <div className="addon-content">
                      <span className="addon-icon">📧</span>
                      <div>
                        <div className="addon-name">Email Pro</div>
                        <div className="addon-price">+$5/month</div>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="comparison-link">
                <button 
                  className="link-button"
                  onClick={() => setShowComparison(!showComparison)}
                >
                  {showComparison ? 'Hide' : 'Show'} detailed comparison
                </button>
              </div>

              {showComparison && (
                <div className="plan-comparison-section">
                  <PlanComparison highlightPlan={selectedPlan} />
                </div>
              )}
            </div>
          ) : (
            <PlanComparison highlightPlan={selectedPlan} />
          )}
        </div>

        <div className="upgrade-modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="btn-upgrade" 
            onClick={handleUpgrade}
            disabled={loading}
          >
            {loading ? 'Processing...' : `Upgrade to ${selectedPlan === 'growth' ? 'Growth' : 'Scale'}`}
          </button>
        </div>

      </div>
    </div>
  );
};

export default UpgradeModal;
