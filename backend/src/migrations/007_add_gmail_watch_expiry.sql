-- Add Gmail watch expiry column to user_credentials table
ALTER TABLE user_credentials 
ADD COLUMN IF NOT EXISTS gmail_watch_expiry BIGINT;

-- Add comment for documentation
COMMENT ON COLUMN user_credentials.gmail_watch_expiry IS 'Gmail watch subscription expiry timestamp';
