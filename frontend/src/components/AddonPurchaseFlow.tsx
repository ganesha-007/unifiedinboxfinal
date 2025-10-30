import React, { useState } from 'react';
import { createCheckoutSession, createPortalSession } from '../services/billing.service';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import './AddonPurchaseFlow.css';

interface AddonPurchaseFlowProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedAddon?: string;
}

const AddonPurchaseFlow: React.FC<AddonPurchaseFlowProps> = ({
  isOpen,
  onClose,
  preselectedAddon
}) => {
  const { user } = useAuth();
  const { subscription, refresh } = useSubscription();
  const [selectedAddons, setSelectedAddons] = useState<string[]>(
    preselectedAddon ? [preselectedAddon] : []
  );
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'select' | 'confirm' | 'processing'>('select');

  if (!isOpen) return null;

  const addons = [
    {
      id: 'whatsapp',
      name: 'WhatsApp Pro',
      price: '$10',
      period: 'per month',
      icon: '💬',
      description: 'Advanced WhatsApp integration with bulk messaging and automation',
      features: [
        'Bulk messaging capabilities',
        'Message templates library',
        'Auto-reply configurations',
        'Advanced WhatsApp analytics',
        'Message scheduling',
        'Contact management'
      ],
      priceId: process.env.REACT_APP_ADDON_WHATSAPP_PRICE_ID
    },
    {
      id: 'instagram',
      name: 'Instagram Pro',
      price: '$10',
      period: 'per month',
      icon: '📸',
      description: 'Enhanced Instagram capabilities with story integration and media management',
      features: [
        'Instagram Story integration',
        'Media library management',
        'Hashtag analytics',
        'Scheduled post publishing',
        'Comment management',
        'Influencer tracking'
      ],
      priceId: process.env.REACT_APP_ADDON_INSTAGRAM_PRICE_ID
    },
    {
      id: 'email',
      name: 'Email Pro',
      price: '$5',
      period: 'per month',
      icon: '📧',
      description: 'Professional email marketing features with templates and automation',
      features: [
        'Email template library',
        'A/B testing capabilities',
        'Advanced email tracking',
        'Automation workflows',
        'Segmentation tools',
        'Deliverability optimization'
      ],
      priceId: process.env.REACT_APP_ADDON_EMAIL_PRICE_ID
    }
  ];

  const toggleAddon = (addonId: string) => {
    setSelectedAddons(prev => 
      prev.includes(addonId)
        ? prev.filter(id => id !== addonId)
        : [...prev, addonId]
    );
  };

  const getSelectedAddonsData = () => {
    return addons.filter(addon => selectedAddons.includes(addon.id));
  };

  const getTotalPrice = () => {
    return getSelectedAddonsData().reduce((total, addon) => {
      return total + parseInt(addon.price.replace('$', ''));
    }, 0);
  };

  const handleContinue = () => {
    if (selectedAddons.length === 0) {
      alert('Please select at least one add-on to continue.');
      return;
    }
    setStep('confirm');
  };

  const handlePurchase = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      setStep('processing');

      const priceIds = getSelectedAddonsData()
        .map(addon => addon.priceId)
        .filter(Boolean) as string[];

      if (priceIds.length === 0) {
        alert('Configuration error. Please contact support.');
        return;
      }

      const response = await createCheckoutSession(user.id, priceIds);
      window.location.href = response.url;
    } catch (error) {
      console.error('Failed to create checkout session:', error);
      alert('Failed to start purchase process. Please try again.');
      setStep('confirm');
    } finally {
      setLoading(false);
    }
  };

  const handleManageExisting = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const response = await createPortalSession(user.id);
      window.location.href = response.url;
    } catch (error) {
      console.error('Failed to open billing portal:', error);
      alert('Failed to open billing portal. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const isAddonActive = (addonId: string): boolean => {
    return subscription?.addons.some(addon => addon.code === addonId && addon.active) || false;
  };

  const getAddonStatus = (addonId: string): string => {
    if (isAddonActive(addonId)) return 'active';
    if (selectedAddons.includes(addonId)) return 'selected';
    return 'available';
  };

  const renderSelectStep = () => (
    <div className="addon-select-step">
      <div className="step-header">
        <h3>Choose Add-ons</h3>
        <p>Enhance your plan with these powerful add-ons:</p>
      </div>

      <div className="addons-list">
        {addons.map((addon) => {
          const status = getAddonStatus(addon.id);
          
          return (
            <div 
              key={addon.id} 
              className={`addon-item ${status}`}
              onClick={() => status === 'available' ? toggleAddon(addon.id) : undefined}
            >
              <div className="addon-main">
                <div className="addon-header">
                  <span className="addon-icon">{addon.icon}</span>
                  <div className="addon-info">
                    <h4 className="addon-name">{addon.name}</h4>
                    <div className="addon-pricing">
                      <span className="addon-price">{addon.price}</span>
                      <span className="addon-period">{addon.period}</span>
                    </div>
                  </div>
                  <div className="addon-status">
                    {status === 'active' && (
                      <span className="status-badge active">Active</span>
                    )}
                    {status === 'selected' && (
                      <span className="status-badge selected">Selected</span>
                    )}
                    {status === 'available' && (
                      <input
                        type="checkbox"
                        checked={selectedAddons.includes(addon.id)}
                        onChange={() => toggleAddon(addon.id)}
                        className="addon-checkbox"
                      />
                    )}
                  </div>
                </div>
                <p className="addon-description">{addon.description}</p>
                <div className="addon-features">
                  <h5>Features included:</h5>
                  <ul>
                    {addon.features.map((feature, index) => (
                      <li key={index}>
                        <span className="feature-check">✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {subscription?.addons.some(addon => addon.active) && (
        <div className="existing-addons-section">
          <h4>Manage Existing Add-ons</h4>
          <p>You can modify or cancel your existing add-ons through the billing portal.</p>
          <button 
            className="btn-manage"
            onClick={handleManageExisting}
            disabled={loading}
          >
            Manage Existing Add-ons
          </button>
        </div>
      )}
    </div>
  );

  const renderConfirmStep = () => (
    <div className="addon-confirm-step">
      <div className="step-header">
        <h3>Confirm Your Selection</h3>
        <p>Review your selected add-ons before purchase:</p>
      </div>

      <div className="selected-addons">
        {getSelectedAddonsData().map((addon) => (
          <div key={addon.id} className="selected-addon-item">
            <div className="addon-summary">
              <span className="addon-icon">{addon.icon}</span>
              <div className="addon-details">
                <h4>{addon.name}</h4>
                <p>{addon.description}</p>
              </div>
              <div className="addon-price">
                {addon.price}<span className="period">/{addon.period.split(' ')[1]}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="pricing-summary">
        <div className="total-row">
          <span>Total monthly cost:</span>
          <span className="total-price">${getTotalPrice()}/month</span>
        </div>
        <div className="billing-note">
          <small>
            * Add-ons will be prorated for the current billing period and will renew monthly.
            You can cancel or modify add-ons anytime through your billing portal.
          </small>
        </div>
      </div>
    </div>
  );

  const renderProcessingStep = () => (
    <div className="addon-processing-step">
      <div className="processing-content">
        <div className="processing-spinner"></div>
        <h3>Processing Your Purchase</h3>
        <p>Please wait while we redirect you to the secure checkout...</p>
      </div>
    </div>
  );

  return (
    <div className="addon-purchase-overlay" onClick={onClose}>
      <div className="addon-purchase-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <button className="close-button" onClick={onClose}>×</button>
          <div className="progress-indicator">
            <div className={`progress-step ${step === 'select' ? 'active' : 'completed'}`}>
              <span className="step-number">1</span>
              <span className="step-label">Select</span>
            </div>
            <div className="progress-line"></div>
            <div className={`progress-step ${step === 'confirm' ? 'active' : step === 'processing' ? 'completed' : ''}`}>
              <span className="step-number">2</span>
              <span className="step-label">Confirm</span>
            </div>
            <div className="progress-line"></div>
            <div className={`progress-step ${step === 'processing' ? 'active' : ''}`}>
              <span className="step-number">3</span>
              <span className="step-label">Purchase</span>
            </div>
          </div>
        </div>

        <div className="modal-content">
          {step === 'select' && renderSelectStep()}
          {step === 'confirm' && renderConfirmStep()}
          {step === 'processing' && renderProcessingStep()}
        </div>

        {step !== 'processing' && (
          <div className="modal-footer">
            {step === 'confirm' && (
              <button 
                className="btn-back"
                onClick={() => setStep('select')}
              >
                Back
              </button>
            )}
            <div className="footer-actions">
              {step === 'select' && (
                <button 
                  className="btn-continue"
                  onClick={handleContinue}
                  disabled={selectedAddons.length === 0}
                >
                  Continue ({selectedAddons.length} selected)
                </button>
              )}
              {step === 'confirm' && (
                <button 
                  className="btn-purchase"
                  onClick={handlePurchase}
                  disabled={loading}
                >
                  {loading ? 'Processing...' : `Purchase for $${getTotalPrice()}/month`}
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default AddonPurchaseFlow;
