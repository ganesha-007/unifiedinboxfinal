-- Update user_123 with UniPile credentials
UPDATE user_credentials 
SET 
  unipile_api_key = 'sMk7/9XI.mQobpR8vUQXfkfCzTenPhVM9zrb7CAAlJgdV4kev6jY=',
  unipile_api_url = 'https://api14.unipile.com:14429/api/v1',
  updated_at = CURRENT_TIMESTAMP
WHERE user_id = 'user_123';

-- If the user doesn't exist, insert them
INSERT INTO user_credentials (user_id, unipile_api_key, unipile_api_url)
VALUES ('user_123', 'sMk7/9XI.mQobpR8vUQXfkfCzTenPhVM9zrb7CAAlJgdV4kev6jY=', 'https://api14.unipile.com:14429/api/v1')
ON CONFLICT (user_id) DO UPDATE 
SET 
  unipile_api_key = EXCLUDED.unipile_api_key,
  unipile_api_url = EXCLUDED.unipile_api_url,
  updated_at = CURRENT_TIMESTAMP;

-- Verify the update
SELECT user_id, unipile_api_key, unipile_api_url, gmail_email FROM user_credentials WHERE user_id = 'user_123';

