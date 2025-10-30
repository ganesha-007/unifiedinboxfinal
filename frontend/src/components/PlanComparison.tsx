import React from 'react';
import { createCheckoutSession } from '../services/billing.service';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import './PlanComparison.css';

interface PlanComparisonProps {
  highlightPlan?: 'starter' | 'growth' | 'scale';
  showCurrentPlan?: boolean;
  onPlanSelect?: (plan: 'starter' | 'growth' | 'scale') => void;
}

const PlanComparison: React.FC<PlanComparisonProps> = ({
  highlightPlan,
  showCurrentPlan = true,
  onPlanSelect
}) => {
  const { user } = useAuth();
  const { subscription } = useSubscription();
  const [loading, setLoading] = React.useState<string | null>(null);

  const plans = [
    {
      id: 'starter' as const,
      name: 'Starter',
      price: 'Free',
      priceDetail: 'Forever',
      description: 'Perfect for getting started',
      features: [
        '1 account connection',
        '100 messages/month',
        'Email integration',
        'Basic analytics',
        'Community support'
      ],
      limitations: [
        'No WhatsApp integration',
        'No Instagram integration',
        'Limited message volume'
      ],
      popular: false,
      color: '#6c757d'
    },
    {
      id: 'growth' as const,
      name: 'Growth',
      price: '$29',
      priceDetail: 'per month',
      description: 'Best for growing businesses',
      features: [
        'Up to 5 account connections',
        '10,000 messages/month',
        'WhatsApp integration',
        'Instagram integration',
        'Email integration',
        'Advanced analytics',
        'Priority support',
        'Custom webhooks'
      ],
      limitations: [],
      popular: true,
      color: '#007bff'
    },
    {
      id: 'scale' as const,
      name: 'Scale',
      price: '$99',
      priceDetail: 'per month',
      description: 'For enterprise-level usage',
      features: [
        'Unlimited account connections',
        'Unlimited messages',
        'All integrations included',
        'Advanced analytics & reporting',
        'Dedicated account manager',
        'Custom integrations',
        'SLA guarantee',
        'White-label options'
      ],
      limitations: [],
      popular: false,
      color: '#28a745'
    }
  ];

  const addons = [
    {
      id: 'whatsapp',
      name: 'WhatsApp Pro',
      price: '$10/month',
      description: 'Advanced WhatsApp features',
      icon: '💬',
      features: [
        'Bulk messaging',
        'Message templates',
        'Auto-replies',
        'Advanced analytics'
      ]
    },
    {
      id: 'instagram',
      name: 'Instagram Pro',
      price: '$10/month',
      description: 'Enhanced Instagram capabilities',
      icon: '📸',
      features: [
        'Story integration',
        'Media management',
        'Hashtag analytics',
        'Scheduled posts'
      ]
    },
    {
      id: 'email',
      name: 'Email Pro',
      price: '$5/month',
      description: 'Professional email features',
      icon: '📧',
      features: [
        'Email templates',
        'A/B testing',
        'Advanced tracking',
        'Automation workflows'
      ]
    }
  ];

  const handleSelectPlan = async (planId: 'starter' | 'growth' | 'scale') => {
    if (onPlanSelect) {
      onPlanSelect(planId);
      return;
    }

    if (planId === 'starter') {
      // Free plan - no checkout needed
      return;
    }

    if (!user?.id) return;

    try {
      setLoading(planId);
      
      const priceId = planId === 'growth' 
        ? process.env.REACT_APP_GROWTH_PRICE_ID 
        : process.env.REACT_APP_SCALE_PRICE_ID;

      if (!priceId) {
        alert('Plan configuration error. Please contact support.');
        return;
      }

      const response = await createCheckoutSession(user.id, [priceId]);
      window.location.href = response.url;
    } catch (error) {
      console.error('Failed to create checkout session:', error);
      alert('Failed to start upgrade process. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  const isCurrentPlan = (planId: string): boolean => {
    return subscription?.planCode === planId;
  };

  const getButtonText = (planId: 'starter' | 'growth' | 'scale'): string => {
    if (loading === planId) return 'Processing...';
    if (isCurrentPlan(planId)) return 'Current Plan';
    if (planId === 'starter') return 'Downgrade';
    return 'Select Plan';
  };

  const getButtonClass = (planId: 'starter' | 'growth' | 'scale'): string => {
    if (isCurrentPlan(planId)) return 'btn-current';
    if (highlightPlan === planId) return 'btn-highlighted';
    if (planId === 'starter') return 'btn-secondary';
    return 'btn-primary';
  };

  return (
    <div className="plan-comparison">
      <div className="plans-grid">
        {plans.map((plan) => (
          <div 
            key={plan.id}
            className={`plan-card ${highlightPlan === plan.id ? 'highlighted' : ''} ${isCurrentPlan(plan.id) ? 'current' : ''}`}
          >
            {plan.popular && <div className="popular-badge">Most Popular</div>}
            {isCurrentPlan(plan.id) && showCurrentPlan && (
              <div className="current-badge">Current Plan</div>
            )}
            
            <div className="plan-header">
              <h3 className="plan-name">{plan.name}</h3>
              <div className="plan-pricing">
                <span className="plan-price">{plan.price}</span>
                <span className="plan-period">{plan.priceDetail}</span>
              </div>
              <p className="plan-description">{plan.description}</p>
            </div>

            <div className="plan-features">
              <h4>Features included:</h4>
              <ul className="features-list">
                {plan.features.map((feature, index) => (
                  <li key={index} className="feature-item">
                    <span className="feature-check">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>

              {plan.limitations.length > 0 && (
                <div className="plan-limitations">
                  <h4>Limitations:</h4>
                  <ul className="limitations-list">
                    {plan.limitations.map((limitation, index) => (
                      <li key={index} className="limitation-item">
                        <span className="limitation-cross">✗</span>
                        {limitation}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="plan-footer">
              <button
                className={`plan-button ${getButtonClass(plan.id)}`}
                onClick={() => handleSelectPlan(plan.id)}
                disabled={loading === plan.id || isCurrentPlan(plan.id)}
              >
                {getButtonText(plan.id)}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="addons-section">
        <h3>Available Add-ons</h3>
        <p>Enhance any plan with these optional add-ons:</p>
        
        <div className="addons-grid">
          {addons.map((addon) => (
            <div key={addon.id} className="addon-card">
              <div className="addon-header">
                <span className="addon-icon">{addon.icon}</span>
                <div>
                  <h4 className="addon-name">{addon.name}</h4>
                  <p className="addon-price">{addon.price}</p>
                </div>
              </div>
              <p className="addon-description">{addon.description}</p>
              <ul className="addon-features">
                {addon.features.map((feature, index) => (
                  <li key={index}>
                    <span className="feature-check">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default PlanComparison;
