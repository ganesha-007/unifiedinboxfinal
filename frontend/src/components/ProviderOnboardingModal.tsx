import React, { useState, useEffect } from 'react';
import { api } from '../config/api';
import './ProviderOnboardingModal.css';

interface ProviderOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  provider: 'whatsapp' | 'instagram';
}

interface UniPileAccount {
  id: string;
  type: string;
  name: string;
  phone_number?: string;
  username?: string;
  is_connected?: boolean;
  connected_by?: string;
  status?: string;
}

const ProviderOnboardingModal: React.FC<ProviderOnboardingModalProps> = ({
  isOpen,
  onClose,
  provider
}) => {
  const [formData, setFormData] = useState({
    unipileApiKey: '',
    unipileApiUrl: 'https://api22.unipile.com:15284/api/v1',
    whatsappPhoneNumber: '',
    webhookUrl: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [availableAccounts, setAvailableAccounts] = useState<UniPileAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string>('');

  // Check if user already has credentials
  useEffect(() => {
    if (isOpen) {
      checkExistingCredentials();
    }
  }, [isOpen]);

  const checkExistingCredentials = async () => {
    try {
      const response = await api.get('/user/credentials');
      if (response.data.hasCredentials) {
        const creds = response.data.data;
        setFormData({
          unipileApiKey: creds.unipile_api_key || '',
          unipileApiUrl: creds.unipile_api_url || 'https://api22.unipile.com:15284/api/v1',
          whatsappPhoneNumber: creds.whatsapp_phone_number || '',
          webhookUrl: creds.webhook_url || ''
        });
      }
    } catch (error) {
      console.error('Failed to check existing credentials:', error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const fetchAvailableAccounts = async () => {
    if (!formData.unipileApiKey || !formData.unipileApiUrl) {
      setError('Please enter UniPile API Key and URL first');
      return;
    }

    setLoadingAccounts(true);
    setError(null);
    try {
      // First save credentials temporarily to fetch accounts
      await api.post('/user/credentials', {
        unipileApiKey: formData.unipileApiKey,
        unipileApiUrl: formData.unipileApiUrl,
        whatsappPhoneNumber: formData.whatsappPhoneNumber,
        webhookUrl: formData.webhookUrl
      });

      // Fetch available accounts for the specific provider
      const response = await api.get(`/channels/${provider}/available`);
      setAvailableAccounts(response.data || []);
    } catch (error: any) {
      console.error('Failed to fetch accounts:', error);
      setError(error.response?.data?.error || 'Failed to fetch available accounts. Please check your UniPile credentials.');
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Save credentials
      const response = await api.post('/user/credentials', formData);
      
      if (response.data.success) {
        // If account is selected, connect it
        if (selectedAccount) {
          try {
            await api.post(`/channels/${provider}/connect`, {
              accountId: selectedAccount
            });
          } catch (connectError: any) {
            console.error('Failed to connect account:', connectError);
            // Don't fail the whole flow if connection fails
          }
        }
        
        setSuccess(true);
        // Close modal after a short delay
        setTimeout(() => {
          onClose();
          // Reload page to refresh connections
          window.location.reload();
        }, 2000);
      }
    } catch (error: any) {
      console.error('Onboarding error:', error);
      setError(error.response?.data?.error || error.response?.data?.message || 'Failed to save credentials');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const providerName = provider === 'whatsapp' ? 'WhatsApp' : 'Instagram';
  const providerIcon = provider === 'whatsapp' ? '💬' : '📸';

  return (
    <div className="provider-onboarding-modal-overlay" onClick={onClose}>
      <div className="provider-onboarding-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-button" onClick={onClose}>×</button>
        
        {success ? (
          <div className="onboarding-success">
            <div className="success-icon">✅</div>
            <h2>Setup Complete!</h2>
            <p>Your {providerName} credentials have been saved successfully.</p>
            <p>You can now use {providerName} integration.</p>
          </div>
        ) : (
          <>
            <div className="modal-header">
              <div className="provider-icon">{providerIcon}</div>
              <h2>Set up {providerName} Integration</h2>
              <p>Enter your UniPile credentials to connect your {providerName} account</p>
            </div>

            <form onSubmit={handleSubmit} className="onboarding-form">
              <div className="form-group">
                <label htmlFor="unipileApiKey">
                  UniPile API Key *
                </label>
                <input
                  type="password"
                  id="unipileApiKey"
                  name="unipileApiKey"
                  value={formData.unipileApiKey}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter your UniPile API key"
                />
                <small>Get this from your UniPile dashboard</small>
              </div>

              <div className="form-group">
                <label htmlFor="unipileApiUrl">
                  UniPile API URL
                </label>
                <input
                  type="url"
                  id="unipileApiUrl"
                  name="unipileApiUrl"
                  value={formData.unipileApiUrl}
                  onChange={handleInputChange}
                  placeholder="https://api22.unipile.com:15284/api/v1"
                />
                <small>Leave default unless you have a custom endpoint</small>
              </div>

              {provider === 'whatsapp' && (
                <div className="form-group">
                  <label htmlFor="whatsappPhoneNumber">
                    WhatsApp Phone Number
                  </label>
                  <input
                    type="tel"
                    id="whatsappPhoneNumber"
                    name="whatsappPhoneNumber"
                    value={formData.whatsappPhoneNumber}
                    onChange={handleInputChange}
                    placeholder="919566651479@s.whatsapp.net"
                  />
                  <small>Your WhatsApp number in international format (e.g., 919566651479@s.whatsapp.net)</small>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="webhookUrl">
                  Webhook URL (Optional)
                </label>
                <input
                  type="url"
                  id="webhookUrl"
                  name="webhookUrl"
                  value={formData.webhookUrl}
                  onChange={handleInputChange}
                  placeholder="https://your-domain.com/api/webhooks/unipile"
                />
                <small>Your webhook URL for receiving messages</small>
              </div>

              {/* Account Selection Section */}
              <div className="form-group">
                <button 
                  type="button" 
                  onClick={fetchAvailableAccounts}
                  disabled={!formData.unipileApiKey || !formData.unipileApiUrl || loadingAccounts}
                  className="fetch-accounts-button"
                >
                  {loadingAccounts ? 'Loading...' : `Load Available ${providerName} Accounts`}
                </button>
                <small>Click to see which {providerName.toLowerCase()} accounts are available to connect</small>
              </div>

              {availableAccounts.length > 0 && (
                <div className="form-group">
                  <label htmlFor="selectedAccount">
                    Select {providerName} Account (Optional)
                  </label>
                  <select
                    id="selectedAccount"
                    name="selectedAccount"
                    value={selectedAccount}
                    onChange={(e) => setSelectedAccount(e.target.value)}
                  >
                    <option value="">-- Select {providerName} Account --</option>
                    {availableAccounts.map(account => (
                      <option 
                        key={account.id} 
                        value={account.id}
                        disabled={account.is_connected}
                      >
                        {provider === 'whatsapp' 
                          ? (account.phone_number || account.name) 
                          : (account.username || account.name)} ({account.id}) 
                        {account.is_connected ? ' - Already connected' : ' - Available'}
                      </option>
                    ))}
                  </select>
                  <small>Choose which {providerName.toLowerCase()} account to connect</small>
                </div>
              )}

              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}

              <div className="modal-actions">
                <button 
                  type="button"
                  onClick={onClose}
                  className="btn-cancel"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-submit"
                  disabled={loading || !formData.unipileApiKey}
                >
                  {loading ? 'Saving...' : `Save & Connect ${providerName}`}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default ProviderOnboardingModal;

