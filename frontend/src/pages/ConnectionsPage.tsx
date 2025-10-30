import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { channelsService, Account } from '../services/channels.service';
import { gmailService } from '../services/gmail.service';
import { outlookService } from '../services/outlook.service';
import { api } from '../config/api';
import FeatureGuard from '../components/FeatureGuard';
import UpgradeModal from '../components/UpgradeModal';
import AddonPurchaseFlow from '../components/AddonPurchaseFlow';
import './ConnectionsPage.css';

const ConnectionsPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [accountIdInput, setAccountIdInput] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<'whatsapp' | 'instagram' | 'email' | 'outlook'>('whatsapp');
  const [selectedEmailProvider, setSelectedEmailProvider] = useState<'gmail' | 'outlook'>('gmail');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showAddonFlow, setShowAddonFlow] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<string>('');
  const [userWhatsAppPhone, setUserWhatsAppPhone] = useState<string>('');

  useEffect(() => {
    setError(''); // Clear any previous errors when switching providers
    loadAccounts();
    loadUserCredentials();
  }, [selectedProvider]);

  const loadUserCredentials = async () => {
    try {
      const response = await api.get('/user/credentials');
      
      if (response.data.hasCredentials && response.data.data.whatsapp_phone_number) {
        const phone = response.data.data.whatsapp_phone_number;
        // Remove @s.whatsapp.net suffix and add + prefix
        const cleanPhone = phone.replace('@s.whatsapp.net', '');
        const formattedPhone = `+${cleanPhone}`;
        setUserWhatsAppPhone(formattedPhone);
      }
    } catch (error) {
      console.error('Failed to load user credentials:', error);
    }
  };

  const loadAccounts = async () => {
    try {
      setLoading(true);
      let data;
      if (selectedProvider === 'email') {
        data = await gmailService.getAccounts();
      } else if (selectedProvider === 'outlook') {
        data = await outlookService.getAccounts();
      } else {
        data = await channelsService.getAccounts(selectedProvider);
      }
      setAccounts(data);
    } catch (err: any) {
      // Only show error for email providers, ignore UniPile errors for WhatsApp/Instagram
      if (selectedProvider === 'email' || selectedProvider === 'outlook') {
        setError(err.response?.data?.error || 'Failed to load accounts');
      } else {
        // For WhatsApp/Instagram, silently handle UniPile errors
        console.log('UniPile service unavailable, showing empty state');
        setAccounts([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      setConnecting(true);
      setError('');
      
      if (selectedProvider === 'email') {
        // For Gmail, initiate OAuth flow
        const { authUrl } = await gmailService.initiateAuth();
        window.location.href = authUrl;
      } else if (selectedProvider === 'outlook') {
        // For Outlook, initiate OAuth flow
        const { authUrl } = await outlookService.initiateAuth();
        window.location.href = authUrl;
      } else {
        // Auto-connect without requiring account ID input
        await channelsService.connectAccount(selectedProvider, '');
        await loadAccounts();
      }
    } catch (err: any) {
      const errorData = err.response?.data;
      if (errorData?.error === 'Account already connected') {
        setError(`This ${selectedProvider} account is already connected by another user. Each account can only be connected by one user.`);
      } else {
        setError(errorData?.error || errorData?.message || 'Failed to connect account');
      }
    } finally {
      setConnecting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return '#4caf50';
      case 'needs_action':
        return '#ff9800';
      case 'disconnected':
        return '#f44336';
      case 'stopped':
        return '#9e9e9e';
      default:
        return '#9e9e9e';
    }
  };

  return (
    <div className="connections-page">
      <div className="header">
        <div className="header-content">
          <h1>Social Media Integration</h1>
          <div className="header-actions">
            <button onClick={() => navigate('/analytics')} className="btn-analytics">
              📊 Analytics
            </button>
            <button onClick={() => navigate('/settings/billing')} className="btn-secondary">
              💳 Billing
            </button>
            <button onClick={() => navigate(`/inbox?provider=${selectedProvider}`)} className="btn-secondary">
              Go to Inbox
            </button>
            <button onClick={logout} className="btn-logout">
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="content">
        <div className="page-header">
          <h2>Connected Accounts</h2>
          <p>Manage your social media accounts</p>
        </div>

        {/* Provider Selection */}
        <div className="provider-selection">
          <div className="provider-tabs">
            <FeatureGuard 
              feature="whatsapp"
              fallback={
                <button
                  className="provider-tab locked"
                  onClick={() => {
                    setSelectedFeature('whatsapp');
                    setShowUpgradeModal(true);
                  }}
                >
                  📱 WhatsApp 🔒
                </button>
              }
            >
              <button
                className={`provider-tab ${selectedProvider === 'whatsapp' ? 'active' : ''}`}
                onClick={() => setSelectedProvider('whatsapp')}
              >
                📱 WhatsApp
              </button>
            </FeatureGuard>
            
            <FeatureGuard 
              feature="instagram"
              fallback={
                <button
                  className="provider-tab locked"
                  onClick={() => {
                    setSelectedFeature('instagram');
                    setShowUpgradeModal(true);
                  }}
                >
                  📸 Instagram 🔒
                </button>
              }
            >
              <button
                className={`provider-tab ${selectedProvider === 'instagram' ? 'active' : ''}`}
                onClick={() => setSelectedProvider('instagram')}
              >
                📸 Instagram
              </button>
            </FeatureGuard>
            
            <button
              className={`provider-tab ${selectedProvider === 'email' ? 'active' : ''}`}
              onClick={() => setSelectedProvider('email')}
            >
              📧 Email
            </button>
            <button
              className={`provider-tab ${selectedProvider === 'outlook' ? 'active' : ''}`}
              onClick={() => setSelectedProvider('outlook')}
            >
              📧 Outlook
            </button>
          </div>
        </div>

        {/* Connect New Account Section */}
        <div className="connect-section">
          <h3>Connect {selectedProvider === 'whatsapp' ? 'WhatsApp' : selectedProvider === 'instagram' ? 'Instagram' : selectedProvider === 'email' ? 'Gmail' : 'Outlook'} Account</h3>
          <div className="connect-form">
            <p className="connect-info">
              {selectedProvider === 'whatsapp' 
                ? `Click below to automatically connect your WhatsApp number (${userWhatsAppPhone || '+919566651479'})`
                : selectedProvider === 'instagram'
                ? 'Click below to automatically connect your Instagram account (ganesh)'
                : selectedProvider === 'email'
                ? 'Click below to connect your Gmail account via OAuth'
                : 'Click below to connect your Outlook account via OAuth'
              }
            </p>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="btn-primary"
            >
              {connecting ? 'Connecting...' : `Connect ${selectedProvider === 'whatsapp' ? 'WhatsApp' : selectedProvider === 'instagram' ? 'Instagram' : selectedProvider === 'email' ? 'Gmail' : 'Outlook'} Account`}
            </button>
          </div>
          {error && <div className="error-message">{error}</div>}
        </div>

        {/* Accounts List */}
        <div className="accounts-section">
          {loading ? (
            <div className="loading">Loading accounts...</div>
          ) : accounts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📱</div>
              <h3>No accounts connected</h3>
              <p>Connect your first WhatsApp account to get started</p>
            </div>
          ) : (
            <div className="accounts-list">
              {accounts.map((account) => (
                <div key={account.id} className="account-card">
                  <div className="account-info">
                    <div className="account-icon">
                      {selectedProvider === 'outlook' ? '📧' : '💬'}
                    </div>
                    <div className="account-details">
                      <h4>{(account as any).display_name || (account as any).phone_number || (account as any).username || (account as any).email || account.external_account_id}</h4>
                      <div className="account-meta">
                        <span className="status-badge" style={{ color: getStatusColor(account.status) }}>
                          {account.status}
                        </span>
                        <span className="account-date">
                          Connected on {(() => {
                            const dateValue = (account as any).connected_at || (account as any).created_at;
                            if (!dateValue) return 'Unknown date';
                            try {
                              return new Date(dateValue).toLocaleDateString();
                            } catch (error) {
                              return 'Invalid date';
                            }
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/inbox?provider=${selectedProvider}`)}
                    className="btn-view"
                  >
                    View Messages
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          feature={selectedFeature}
          reason={`${selectedFeature === 'whatsapp' ? 'WhatsApp' : 'Instagram'} integration is not available on your current plan.`}
          recommendedPlan="growth"
        />
      )}

      {/* Add-on Purchase Flow */}
      {showAddonFlow && (
        <AddonPurchaseFlow
          isOpen={showAddonFlow}
          onClose={() => setShowAddonFlow(false)}
          preselectedAddon={selectedFeature}
        />
      )}
    </div>
  );
};

export default ConnectionsPage;

