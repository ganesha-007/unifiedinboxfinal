-- Per-workspace/email limits and flags
CREATE TABLE IF NOT EXISTS workspace_settings (
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
);


