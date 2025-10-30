-- Create email usage cache table for rate limiting
CREATE TABLE IF NOT EXISTS email_usage_cache (
    key VARCHAR(255) PRIMARY KEY,
    count INTEGER DEFAULT 0,
    value TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for efficient cleanup
CREATE INDEX IF NOT EXISTS idx_email_usage_cache_expires_at ON email_usage_cache(expires_at);

-- Add is_trial column to channels_account for trial detection
ALTER TABLE channels_account 
ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT FALSE;

-- Clean up expired entries function
CREATE OR REPLACE FUNCTION cleanup_expired_email_cache()
RETURNS void AS $$
BEGIN
    DELETE FROM email_usage_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
