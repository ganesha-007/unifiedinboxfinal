import React from 'react';
import { Link } from 'react-router-dom';

export default function BillingSuccessPage() {
  return (
    <div style={{ padding: 32, maxWidth: 720, margin: '0 auto' }}>
      <h2>✅ Payment successful</h2>
      <p>Your subscription is now active. Webhooks may take a moment to sync.</p>
      <div style={{ marginTop: 12 }}>
        <Link to="/settings/billing">Back to Billing</Link>
      </div>
    </div>
  );
}



