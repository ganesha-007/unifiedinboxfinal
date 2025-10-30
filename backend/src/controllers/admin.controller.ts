import { Request, Response } from 'express';
import { pool } from '../config/database';
 

async function ensureWorkspaceSettingsTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS workspace_settings (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    email_max_recipients_per_message INT,
    email_max_per_hour INT,
    email_max_per_day INT,
    email_per_recipient_cooldown_sec INT,
    email_per_domain_cooldown_sec INT,
    email_max_attachment_bytes BIGINT,
    trial_mode BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`);
}

export async function getWorkspaceLimits(req: Request, res: Response) {
  try {
    const userId = req.params.userId as string;
    const r = await pool.query('SELECT * FROM workspace_settings WHERE user_id = $1', [userId]);
    return res.json(r.rows[0] || null);
  } catch (e) {
    console.error('getWorkspaceLimits error', e);
    // Return null so UI can still render and allow saving defaults
    return res.status(200).json(null);
  }
}

export async function upsertWorkspaceLimits(req: Request, res: Response) {
  try {
    await ensureWorkspaceSettingsTable();
    const userId = req.params.userId as string;
    const b = req.body || {};
    const r = await pool.query(
      `INSERT INTO workspace_settings (
         user_id,
         email_max_recipients_per_message,
         email_max_per_hour,
         email_max_per_day,
         email_per_recipient_cooldown_sec,
         email_per_domain_cooldown_sec,
         email_max_attachment_bytes,
         trial_mode,
         updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP)
       ON CONFLICT (user_id)
       DO UPDATE SET
         email_max_recipients_per_message = EXCLUDED.email_max_recipients_per_message,
         email_max_per_hour = EXCLUDED.email_max_per_hour,
         email_max_per_day = EXCLUDED.email_max_per_day,
         email_per_recipient_cooldown_sec = EXCLUDED.email_per_recipient_cooldown_sec,
         email_per_domain_cooldown_sec = EXCLUDED.email_per_domain_cooldown_sec,
         email_max_attachment_bytes = EXCLUDED.email_max_attachment_bytes,
         trial_mode = EXCLUDED.trial_mode,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        userId,
        b.email_max_recipients_per_message ?? null,
        b.email_max_per_hour ?? null,
        b.email_max_per_day ?? null,
        b.email_per_recipient_cooldown_sec ?? null,
        b.email_per_domain_cooldown_sec ?? null,
        b.email_max_attachment_bytes ?? null,
        b.trial_mode ?? null,
      ]
    );
    return res.json(r.rows[0]);
  } catch (e) {
    console.error('upsertWorkspaceLimits error', e);
    try {
      // Attempt to auto-create table then retry once
      await ensureWorkspaceSettingsTable();
      const userId = req.params.userId as string;
      const b = req.body || {};
      const r = await pool.query(
        `INSERT INTO workspace_settings (
           user_id,
           email_max_recipients_per_message,
           email_max_per_hour,
           email_max_per_day,
           email_per_recipient_cooldown_sec,
           email_per_domain_cooldown_sec,
           email_max_attachment_bytes,
           trial_mode,
           updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP)
         ON CONFLICT (user_id)
         DO UPDATE SET
           email_max_recipients_per_message = EXCLUDED.email_max_recipients_per_message,
           email_max_per_hour = EXCLUDED.email_max_per_hour,
           email_max_per_day = EXCLUDED.email_max_per_day,
           email_per_recipient_cooldown_sec = EXCLUDED.email_per_recipient_cooldown_sec,
           email_per_domain_cooldown_sec = EXCLUDED.email_per_domain_cooldown_sec,
           email_max_attachment_bytes = EXCLUDED.email_max_attachment_bytes,
           trial_mode = EXCLUDED.trial_mode,
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [
          userId,
          req.body?.email_max_recipients_per_message ?? null,
          req.body?.email_max_per_hour ?? null,
          req.body?.email_max_per_day ?? null,
          req.body?.email_per_recipient_cooldown_sec ?? null,
          req.body?.email_per_domain_cooldown_sec ?? null,
          req.body?.email_max_attachment_bytes ?? null,
          req.body?.trial_mode ?? null,
        ]
      );
      return res.json(r.rows[0]);
    } catch (e2) {
      console.error('upsertWorkspaceLimits retry error', e2);
      return res.status(500).json({ error: 'Failed to upsert workspace settings' });
    }
  }
}

export async function toggleTrialMode(req: Request, res: Response) {
  try {
    const userId = req.params.userId as string;
    const { trial_mode } = req.body as { trial_mode: boolean };
    const r = await pool.query(
      `INSERT INTO workspace_settings (user_id, trial_mode, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id)
       DO UPDATE SET trial_mode = EXCLUDED.trial_mode, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, !!trial_mode]
    );
    return res.json(r.rows[0]);
  } catch (e) {
    console.error('toggleTrialMode error', e);
    return res.status(500).json({ error: 'Failed to toggle trial mode' });
  }
}

export async function listLimiterEvents(req: Request, res: Response) {
  try {
    const userId = (req.query.userId as string) || (req.params as any).userId;
    const since = req.query.since ? new Date(req.query.since as string) : new Date(Date.now() - 24*60*60*1000);
    const r = await pool.query(
      `SELECT id, user_id, mailbox_id, provider, code, message, created_at
       FROM limiter_events
       WHERE user_id = $1 AND created_at >= $2
       ORDER BY created_at DESC
       LIMIT 500`,
      [userId, since]
    );
    return res.json(r.rows);
  } catch (e) {
    console.error('listLimiterEvents error', e);
    // Return empty list to avoid frontend erroring when table not yet present
    return res.status(200).json([]);
  }
}


