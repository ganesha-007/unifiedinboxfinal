-- Fix user_123 credentials with proper UniPile credentials
INSERT INTO user_credentials (user_id, unipile_api_key, unipile_api_url)
VALUES ('user_123', 'sMk7/9XI.mQobpR8vUQXfkfCzTenPhVM9zrb7CAAlJgdV4kev6jY=', 'https://api14.unipile.com:14429/api/v1')
ON CONFLICT (user_id) DO UPDATE 
SET 
  unipile_api_key = EXCLUDED.unipile_api_key,
  unipile_api_url = EXCLUDED.unipile_api_url,
  updated_at = CURRENT_TIMESTAMP;

