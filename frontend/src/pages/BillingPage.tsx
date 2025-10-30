import React, { useEffect, useState } from 'react';
import { createCheckoutSession, createPortalSession, getSubscription } from '../services/billing.service';
import PlanComparison from '../components/PlanComparison';
import AddonPurchaseFlow from '../components/AddonPurchaseFlow';
import { useSubscription } from '../hooks/useSubscription';
import './BillingPage.css';

export default function BillingPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [showAddonFlow, setShowAddonFlow] = useState(false);
  const [view, setView] = useState<'overview' | 'plans' | 'addons'>('overview');
  const { subscription, refresh } = useSubscription();
  const userId = 'user_123';

  useEffect(() => {
    (async () => {
      try {
        const sub = await getSubscription(userId);
        setStatus(sub);
      } catch {}
    })();
  }, []);

  const handleUpgrade = async (plan: 'starter' | 'growth' | 'scale', addons: string[] = []) => {
    try {
      setLoading(true);
      const planPrice =
        plan === 'starter' ? process.env.REACT_APP_STARTER_PRICE_ID :
        plan === 'growth' ? process.env.REACT_APP_GROWTH_PRICE_ID :
        process.env.REACT_APP_SCALE_PRICE_ID;
      const addonPrices: string[] = [];
      if (addons.includes('whatsapp') && process.env.REACT_APP_ADDON_WHATSAPP_PRICE_ID) addonPrices.push(process.env.REACT_APP_ADDON_WHATSAPP_PRICE_ID);
      if (addons.includes('instagram') && process.env.REACT_APP_ADDON_INSTAGRAM_PRICE_ID) addonPrices.push(process.env.REACT_APP_ADDON_INSTAGRAM_PRICE_ID);
      if (addons.includes('email') && process.env.REACT_APP_ADDON_EMAIL_PRICE_ID) addonPrices.push(process.env.REACT_APP_ADDON_EMAIL_PRICE_ID);

      const res = await createCheckoutSession(userId, [planPrice || '', ...addonPrices].filter(Boolean));
      window.location.href = res.url;
    } catch (e) {
      alert('Failed to start checkout');
    } finally {
      setLoading(false);
    }
  };

  const handleManage = async () => {
    try {
      setLoading(true);
      const res = await createPortalSession(userId);
      window.location.href = res.url;
    } catch (e) {
      alert('Failed to open billing portal');
    } finally {
      setLoading(false);
    }
  };

  const renderOverview = () => (
    <div className="billing-overview">
      <div className="current-subscription">
        <h2>Current Subscription</h2>
        {subscription ? (
          <div className="subscription-card">
            <div className="subscription-header">
              <div className="plan-info">
                <h3>{subscription.planName}</h3>
                <span className={`status-badge ${subscription.status}`}>
                  {subscription.status}
                </span>
              </div>
              <div className="subscription-actions">
                <button 
                  className="btn-manage"
                  onClick={handleManage}
                  disabled={loading}
                >
                  Manage Subscription
                </button>
              </div>
            </div>
            
            <div className="subscription-details">
              <div className="detail-item">
                <span className="label">Billing Period:</span>
                <span className="value">
                  {new Date(subscription.currentPeriodStart).toLocaleDateString()} - {' '}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </span>
              </div>
              
              {subscription.trialEnd && (
                <div className="detail-item">
                  <span className="label">Trial Ends:</span>
                  <span className="value">{new Date(subscription.trialEnd).toLocaleDateString()}</span>
                </div>
              )}
              
              {subscription.cancelAtPeriodEnd && (
                <div className="cancel-notice">
                  ⚠️ Your subscription will cancel at the end of the current period
                </div>
              )}
            </div>

            {subscription.addons.length > 0 && (
              <div className="active-addons">
                <h4>Active Add-ons</h4>
                <div className="addons-list">
                  {subscription.addons.map((addon) => (
                    <div key={addon.code} className="addon-item">
                      <span className="addon-name">{addon.name}</span>
                      <span className={`addon-status ${addon.active ? 'active' : 'inactive'}`}>
                        {addon.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="no-subscription">
            <p>You're currently on the free Starter plan.</p>
            <button 
              className="btn-upgrade"
              onClick={() => setView('plans')}
            >
              View Plans
            </button>
          </div>
        )}
      </div>

      <div className="quick-actions">
        <h2>Quick Actions</h2>
        <div className="actions-grid">
          <button 
            className="action-card"
            onClick={() => setView('plans')}
          >
            <div className="action-icon">📊</div>
            <div className="action-content">
              <h3>Compare Plans</h3>
              <p>See all available plans and features</p>
            </div>
          </button>
          
          <button 
            className="action-card"
            onClick={() => setShowAddonFlow(true)}
          >
            <div className="action-icon">🔧</div>
            <div className="action-content">
              <h3>Add Features</h3>
              <p>Purchase add-ons to enhance your plan</p>
            </div>
          </button>
          
          <button 
            className="action-card"
            onClick={handleManage}
          >
            <div className="action-icon">⚙️</div>
            <div className="action-content">
              <h3>Billing Portal</h3>
              <p>Manage payment methods and invoices</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="billing-container">
      <div className="billing-header">
        <h1>💰 Billing & Subscription</h1>
        <p>Manage your subscription and billing information</p>
        
        <div className="view-tabs">
          <button 
            className={`view-tab ${view === 'overview' ? 'active' : ''}`}
            onClick={() => setView('overview')}
          >
            Overview
          </button>
          <button 
            className={`view-tab ${view === 'plans' ? 'active' : ''}`}
            onClick={() => setView('plans')}
          >
            Plans
          </button>
          <button 
            className={`view-tab ${view === 'addons' ? 'active' : ''}`}
            onClick={() => setView('addons')}
          >
            Add-ons
          </button>
        </div>
      </div>

      <div className="billing-content">
        {view === 'overview' && renderOverview()}
        {view === 'plans' && (
          <div className="plans-view">
            <PlanComparison 
              highlightPlan={subscription?.planCode as 'starter' | 'growth' | 'scale'}
              showCurrentPlan={true}
            />
          </div>
        )}
        {view === 'addons' && (
          <div className="addons-view">
            <div className="addons-header">
              <h2>Available Add-ons</h2>
              <p>Enhance your plan with these powerful add-ons</p>
              <button 
                className="btn-purchase-addons"
                onClick={() => setShowAddonFlow(true)}
              >
                Purchase Add-ons
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add-on Purchase Flow Modal */}
      {showAddonFlow && (
        <AddonPurchaseFlow
          isOpen={showAddonFlow}
          onClose={() => setShowAddonFlow(false)}
        />
      )}
    </div>
  );
}