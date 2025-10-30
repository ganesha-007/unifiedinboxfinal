const API = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export type WorkspaceSettings = {
  user_id: string;
  email_max_recipients_per_message?: number | null;
  email_max_per_hour?: number | null;
  email_max_per_day?: number | null;
  email_per_recipient_cooldown_sec?: number | null;
  email_per_domain_cooldown_sec?: number | null;
  email_max_attachment_bytes?: number | null;
  trial_mode?: boolean | null;
  updated_at?: string;
};

export async function getWorkspaceLimits(userId: string): Promise<WorkspaceSettings | null> {
  const res = await fetch(`${API}/admin/workspace/${encodeURIComponent(userId)}/limits`);
  if (!res.ok) throw new Error('Failed to fetch workspace limits');
  return res.json();
}

export async function upsertWorkspaceLimits(userId: string, body: Partial<WorkspaceSettings>) {
  const res = await fetch(`${API}/admin/workspace/${encodeURIComponent(userId)}/limits`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to save workspace limits');
  return res.json();
}

export async function toggleTrialMode(userId: string, trial: boolean) {
  const res = await fetch(`${API}/admin/workspace/${encodeURIComponent(userId)}/trial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trial_mode: trial }),
  });
  if (!res.ok) throw new Error('Failed to toggle trial mode');
  return res.json();
}

export async function listLimiterEvents(userId: string, sinceIso?: string) {
  const url = new URL(`${API}/admin/limiter-events`);
  url.searchParams.set('userId', userId);
  if (sinceIso) url.searchParams.set('since', sinceIso);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch limiter events');
  return res.json();
}


