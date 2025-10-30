const API = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export async function createCheckoutSession(userId: string, priceIds: string[]) {
  const res = await fetch(`${API}/billing/checkout/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, priceIds }),
  });
  if (!res.ok) throw new Error('Failed to create checkout session');
  return res.json();
}

export async function createPortalSession(userId: string) {
  const res = await fetch(`${API}/billing/portal/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error('Failed to create portal session');
  return res.json();
}

export async function getSubscription(userId: string) {
  const res = await fetch(`${API}/billing/subscription?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error('Failed to fetch subscription');
  return res.json();
}



