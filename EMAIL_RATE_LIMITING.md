# Email Rate Limiting Environment Variables

The following environment variables are required for the email rate limiting system:

## Required Environment Variables

```bash
# Email Rate Limiting Configuration
EMAIL_MAX_RECIPIENTS_PER_MESSAGE=10
EMAIL_MAX_PER_HOUR=50
EMAIL_MAX_PER_DAY=200
EMAIL_PER_RECIPIENT_COOLDOWN_SEC=120
EMAIL_PER_DOMAIN_COOLDOWN_SEC=60
EMAIL_MAX_ATTACHMENT_BYTES=10485760
EMAIL_TRIAL_DAILY_CAP=20
```

## Variable Descriptions

- `EMAIL_MAX_RECIPIENTS_PER_MESSAGE`: Maximum number of recipients (to, cc, bcc) per email (default: 10)
- `EMAIL_MAX_PER_HOUR`: Maximum emails that can be sent per hour (default: 50)
- `EMAIL_MAX_PER_DAY`: Maximum emails that can be sent per day (default: 200)
- `EMAIL_PER_RECIPIENT_COOLDOWN_SEC`: Cooldown period in seconds before sending another email to the same recipient (default: 120)
- `EMAIL_PER_DOMAIN_COOLDOWN_SEC`: Cooldown period in seconds before sending another email to the same domain (default: 60)
- `EMAIL_MAX_ATTACHMENT_BYTES`: Maximum attachment size in bytes (default: 10485760 = 10MB)
- `EMAIL_TRIAL_DAILY_CAP`: Daily email limit for trial accounts (default: 20)

## How to Add to Your .env File

Add these variables to your `backend/.env` file:

```bash
# Email Rate Limiting Configuration
EMAIL_MAX_RECIPIENTS_PER_MESSAGE=10
EMAIL_MAX_PER_HOUR=50
EMAIL_MAX_PER_DAY=200
EMAIL_PER_RECIPIENT_COOLDOWN_SEC=120
EMAIL_PER_DOMAIN_COOLDOWN_SEC=60
EMAIL_MAX_ATTACHMENT_BYTES=10485760
EMAIL_TRIAL_DAILY_CAP=20
```

## Docker Compose Configuration

These variables are already configured in `docker-compose.yml` for production deployment.

## Rate Limiting Features

The email rate limiting system provides:

1. **Per-hour limits**: Prevents spam by limiting emails per hour
2. **Per-day limits**: Prevents abuse by limiting emails per day
3. **Recipient cooldowns**: Prevents rapid-fire emails to the same person
4. **Domain pacing**: Prevents rapid-fire emails to the same domain
5. **Attachment limits**: Prevents large file abuse
6. **Trial account limits**: Special limits for trial users

## API Endpoints

- `POST /api/channels/email/:accountId/chats/:chatId/send` - Send email (with rate limiting)
- `GET /api/channels/email/:accountId/limits` - Get current usage statistics
- `POST /api/channels/email/setup-watch` - Set up Gmail watch subscription

## Error Responses

When rate limits are exceeded, the API returns:

```json
{
  "error": "Email rate limit exceeded",
  "code": "HOURLY_CAP|DAILY_CAP|RECIPIENT_COOLDOWN|DOMAIN_COOLDOWN|ATTACHMENT_TOO_LARGE",
  "message": "Specific error message"
}
```

Status code: `402 Payment Required`
