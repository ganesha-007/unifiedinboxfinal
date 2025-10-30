import React from 'react';
import { Link } from 'react-router-dom';

export default function BillingCancelPage() {
  return (
    <div style={{ padding: 32, maxWidth: 720, margin: '0 auto' }}>
      <h2>⚠️ Checkout canceled</h2>
      <p>No changes were made. You can try again anytime.</p>
      <div style={{ marginTop: 12 }}>
        <Link to="/settings/billing">Back to Billing</Link>
      </div>
    </div>
  );
}



