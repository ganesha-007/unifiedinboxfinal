import React, { useEffect, useMemo, useState } from 'react';
import { getWorkspaceLimits, upsertWorkspaceLimits, toggleTrialMode, listLimiterEvents, WorkspaceSettings } from '../services/admin.service';
import './AdminLimitsPage.css';

export default function AdminLimitsPage() {
  const userId = 'user_123';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [sinceHours, setSinceHours] = useState(24);

  const sinceIso = useMemo(() => new Date(Date.now() - sinceHours * 3600 * 1000).toISOString(), [sinceHours]);

  useEffect(() => {
    (async () => {
      try {
        const s = await getWorkspaceLimits(userId);
        setSettings(s);
        const ev = await listLimiterEvents(userId, sinceIso);
        setEvents(ev);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, sinceIso]);

  const onChange = (key: keyof WorkspaceSettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setSettings(prev => ({ ...(prev || { user_id: userId }), [key]: e.target.type === 'number' ? (val === '' ? null : Number(val)) : val } as any));
  };

  const onSave = async () => {
    try {
      setSaving(true);
      const body: Partial<WorkspaceSettings> = { ...settings };
      delete (body as any).user_id;
      delete (body as any).updated_at;
      const saved = await upsertWorkspaceLimits(userId, body);
      setSettings(saved);
      alert('Saved');
    } catch {
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const onToggleTrial = async () => {
    try {
      const next = !(settings?.trial_mode ?? false);
      const saved = await toggleTrialMode(userId, next);
      setSettings(saved);
    } catch {
      alert('Failed to toggle trial');
    }
  };

  if (loading) return <div className="admin-limits-loading">Loading…</div>;

  return (
    <div className="admin-limits-container">
      <div className="admin-limits-header">
        <h2>Admin · Workspace Email Limits</h2>
        <div className="admin-limits-subtitle">Configure safety caps, pacing, and trial mode for this workspace.</div>
      </div>

      <div className="admin-limits-grid">
        <div className="admin-card">
          <div className="admin-card-title">Limits & Pacing</div>
          <div className="admin-form-grid">
            <label className="admin-field">
              <span className="admin-label">Max recipients per message</span>
              <input className="admin-input" type="number" placeholder="e.g., 10" value={settings?.email_max_recipients_per_message ?? ''} onChange={onChange('email_max_recipients_per_message')} />
              <span className="admin-help">Prevents bulk blasts; default 10.</span>
            </label>
            <label className="admin-field">
              <span className="admin-label">Max emails per hour</span>
              <input className="admin-input" type="number" placeholder="e.g., 50" value={settings?.email_max_per_hour ?? ''} onChange={onChange('email_max_per_hour')} />
              <span className="admin-help">Rolling hourly cap; default 50.</span>
            </label>
            <label className="admin-field">
              <span className="admin-label">Max emails per day</span>
              <input className="admin-input" type="number" placeholder="e.g., 200" value={settings?.email_max_per_day ?? ''} onChange={onChange('email_max_per_day')} />
              <span className="admin-help">Resets 00:00 UTC; default 200.</span>
            </label>
            <label className="admin-field">
              <span className="admin-label">Per-recipient cooldown (sec)</span>
              <input className="admin-input" type="number" placeholder="e.g., 120" value={settings?.email_per_recipient_cooldown_sec ?? ''} onChange={onChange('email_per_recipient_cooldown_sec')} />
              <span className="admin-help">Delay between emails to same person; default 120s.</span>
            </label>
            <label className="admin-field">
              <span className="admin-label">Per-domain cooldown (sec)</span>
              <input className="admin-input" type="number" placeholder="e.g., 60" value={settings?.email_per_domain_cooldown_sec ?? ''} onChange={onChange('email_per_domain_cooldown_sec')} />
              <span className="admin-help">Pacing for the same domain; default 60s.</span>
            </label>
            <label className="admin-field">
              <span className="admin-label">Max attachment size (bytes)</span>
              <input className="admin-input" type="number" placeholder="e.g., 10485760" value={settings?.email_max_attachment_bytes ?? ''} onChange={onChange('email_max_attachment_bytes')} />
              <span className="admin-help">Default 10 MB (10,485,760 bytes).</span>
            </label>
            <label className="admin-switch">
              <input type="checkbox" checked={!!settings?.trial_mode} onChange={onChange('trial_mode')} />
              <span>Trial mode</span>
            </label>
          </div>
          <div className="admin-actions">
            <button className="btn-primary" onClick={onSave} disabled={saving}>Save changes</button>
            <button className="btn-secondary" onClick={onToggleTrial}>Toggle Trial</button>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-title">Limiter Events</div>
          <div className="admin-toolbar">
            <label className="admin-toolbar-field">
              <span>Since hours</span>
              <input className="admin-input" type="number" value={sinceHours} onChange={(e) => setSinceHours(Number(e.target.value || 24))} />
            </label>
          </div>
          <div className="admin-table">
            <div className="admin-table-head">
              <div>Time</div><div>Mailbox</div><div>Code</div><div>Message</div>
            </div>
            {events.map((e) => (
              <div key={e.id} className="admin-table-row">
                <div>{new Date(e.created_at).toLocaleString()}</div>
                <div>{e.mailbox_id || '-'}</div>
                <div><span className="badge-neutral">{e.code}</span></div>
                <div className="truncate">{e.message}</div>
              </div>
            ))}
            {events.length === 0 && <div className="admin-table-empty">No events</div>}
          </div>
        </div>
      </div>
    </div>
  );
}


