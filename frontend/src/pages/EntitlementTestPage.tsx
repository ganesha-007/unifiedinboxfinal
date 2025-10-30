import React, { useState } from 'react';
import FeatureGuard from '../components/FeatureGuard';
import UpgradeModal from '../components/UpgradeModal';
import PlanComparison from '../components/PlanComparison';
import AddonPurchaseFlow from '../components/AddonPurchaseFlow';
import { useSubscription } from '../hooks/useSubscription';

const EntitlementTestPage: React.FC = () => {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showPlanComparison, setShowPlanComparison] = useState(false);
  const [showAddonFlow, setShowAddonFlow] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState('whatsapp');
  
  const { subscription, loading, hasFeature, canUseFeature } = useSubscription();

  const testFeature = (feature: string) => {
    setSelectedFeature(feature);
    setShowUpgradeModal(true);
  };

  return (
    <div style={{ padding: '40px 20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>🧪 Frontend Entitlement UI Test Page</h1>
      <p>This page demonstrates all the new entitlement UI components.</p>

      {/* Subscription Status */}
      <section style={{ marginBottom: '40px', background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h2>Current Subscription Status</h2>
        {loading ? (
          <p>Loading subscription...</p>
        ) : subscription ? (
          <div>
            <p><strong>Plan:</strong> {subscription.planName}</p>
            <p><strong>Status:</strong> {subscription.status}</p>
            <p><strong>WhatsApp Access:</strong> {hasFeature('whatsapp') ? '✅ Yes' : '❌ No'}</p>
            <p><strong>Instagram Access:</strong> {hasFeature('instagram') ? '✅ Yes' : '❌ No'}</p>
            <p><strong>Email Access:</strong> {hasFeature('email') ? '✅ Yes' : '❌ No'}</p>
            <p><strong>Multiple Accounts:</strong> {hasFeature('multiple_accounts') ? '✅ Yes' : '❌ No'}</p>
          </div>
        ) : (
          <p>No subscription data available (using default free plan)</p>
        )}
      </section>

      {/* Feature Guard Examples */}
      <section style={{ marginBottom: '40px', background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h2>FeatureGuard Component Examples</h2>
        
        <div style={{ display: 'grid', gap: '20px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <div>
            <h3>WhatsApp Feature</h3>
            <FeatureGuard feature="whatsapp">
              <div style={{ padding: '20px', background: '#d4edda', border: '1px solid #c3e6cb', borderRadius: '4px' }}>
                🎉 WhatsApp feature is available! You can use all WhatsApp functionality.
              </div>
            </FeatureGuard>
          </div>

          <div>
            <h3>Instagram Feature</h3>
            <FeatureGuard feature="instagram">
              <div style={{ padding: '20px', background: '#d4edda', border: '1px solid #c3e6cb', borderRadius: '4px' }}>
                🎉 Instagram feature is available! You can use all Instagram functionality.
              </div>
            </FeatureGuard>
          </div>

          <div>
            <h3>Multiple Accounts Feature</h3>
            <FeatureGuard feature="multiple_accounts">
              <div style={{ padding: '20px', background: '#d4edda', border: '1px solid #c3e6cb', borderRadius: '4px' }}>
                🎉 Multiple accounts feature is available! You can connect multiple accounts.
              </div>
            </FeatureGuard>
          </div>
        </div>
      </section>

      {/* Component Test Buttons */}
      <section style={{ marginBottom: '40px', background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h2>Component Tests</h2>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button 
            onClick={() => testFeature('whatsapp')}
            style={{ padding: '12px 24px', background: '#007bff', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            Test WhatsApp Upgrade Modal
          </button>
          
          <button 
            onClick={() => testFeature('instagram')}
            style={{ padding: '12px 24px', background: '#007bff', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            Test Instagram Upgrade Modal
          </button>
          
          <button 
            onClick={() => setShowPlanComparison(true)}
            style={{ padding: '12px 24px', background: '#28a745', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            Show Plan Comparison
          </button>
          
          <button 
            onClick={() => setShowAddonFlow(true)}
            style={{ padding: '12px 24px', background: '#ffc107', color: 'black', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            Show Add-on Purchase Flow
          </button>
        </div>
      </section>

      {/* Plan Comparison (Inline) */}
      {showPlanComparison && (
        <section style={{ marginBottom: '40px', background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2>Plan Comparison</h2>
            <button 
              onClick={() => setShowPlanComparison(false)}
              style={{ padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Hide
            </button>
          </div>
          <PlanComparison highlightPlan="growth" />
        </section>
      )}

      {/* Navigation Links */}
      <section style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h2>Navigation</h2>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <a 
            href="/connections" 
            style={{ padding: '12px 24px', background: '#17a2b8', color: 'white', textDecoration: 'none', borderRadius: '6px' }}
          >
            Go to Connections (with FeatureGuard)
          </a>
          <a 
            href="/settings/billing" 
            style={{ padding: '12px 24px', background: '#6f42c1', color: 'white', textDecoration: 'none', borderRadius: '6px' }}
          >
            Go to Billing Page
          </a>
        </div>
      </section>

      {/* Modals */}
      {showUpgradeModal && (
        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          feature={selectedFeature}
          reason={`${selectedFeature === 'whatsapp' ? 'WhatsApp' : 'Instagram'} integration is not available on your current plan.`}
          recommendedPlan="growth"
        />
      )}

      {showAddonFlow && (
        <AddonPurchaseFlow
          isOpen={showAddonFlow}
          onClose={() => setShowAddonFlow(false)}
        />
      )}
    </div>
  );
};

export default EntitlementTestPage;
