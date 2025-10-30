-- Create tables for email bounce and complaint tracking

-- Email Bounces Table
CREATE TABLE IF NOT EXISTS email_bounces (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    mailbox_id TEXT NOT NULL,
    email_address TEXT NOT NULL,
    bounce_type TEXT NOT NULL CHECK (bounce_type IN ('hard', 'soft', 'transient')),
    bounce_reason TEXT,
    bounce_code TEXT,
    bounce_category TEXT,
    diagnostic_code TEXT,
    original_message_id TEXT,
    recipient_email TEXT NOT NULL,
    bounced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_bounces_user_id ON email_bounces(user_id);
CREATE INDEX IF NOT EXISTS idx_email_bounces_email_address ON email_bounces(email_address);
CREATE INDEX IF NOT EXISTS idx_email_bounces_bounced_at ON email_bounces(bounced_at);
CREATE INDEX IF NOT EXISTS idx_email_bounces_user_email ON email_bounces(user_id, email_address);
CREATE INDEX IF NOT EXISTS idx_email_bounces_mailbox_id ON email_bounces(mailbox_id);

-- Email Complaints Table
CREATE TABLE IF NOT EXISTS email_complaints (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    mailbox_id TEXT NOT NULL,
    email_address TEXT NOT NULL,
    complaint_type TEXT,
    complaint_reason TEXT,
    complaint_feedback_type TEXT,
    original_message_id TEXT,
    recipient_email TEXT NOT NULL,
    complained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_complaints_user_id ON email_complaints(user_id);
CREATE INDEX IF NOT EXISTS idx_email_complaints_email_address ON email_complaints(email_address);
CREATE INDEX IF NOT EXISTS idx_email_complaints_complained_at ON email_complaints(complained_at);
CREATE INDEX IF NOT EXISTS idx_email_complaints_user_email ON email_complaints(user_id, email_address);
CREATE INDEX IF NOT EXISTS idx_email_complaints_mailbox_id ON email_complaints(mailbox_id);

-- Email Reputation Tracking Table
CREATE TABLE IF NOT EXISTS email_reputation (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    mailbox_id TEXT NOT NULL,
    bounce_rate DECIMAL(5, 2) DEFAULT 0.00,
    complaint_rate DECIMAL(5, 2) DEFAULT 0.00,
    hard_bounce_count INTEGER DEFAULT 0,
    soft_bounce_count INTEGER DEFAULT 0,
    complaint_count INTEGER DEFAULT 0,
    total_sent INTEGER DEFAULT 0,
    reputation_score INTEGER DEFAULT 100 CHECK (reputation_score >= 0 AND reputation_score <= 100),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_reputation_user_id ON email_reputation(user_id);

-- Comments
COMMENT ON TABLE email_bounces IS 'Tracks email bounce events for deliverability monitoring';
COMMENT ON TABLE email_complaints IS 'Tracks spam complaint events for reputation management';
COMMENT ON TABLE email_reputation IS 'Aggregated reputation metrics per user/mailbox';
