# Gmail Pub/Sub Webhook Setup Guide

This guide explains how to set up Gmail Pub/Sub webhooks for real-time email notifications.

## Prerequisites

- Google Cloud Project with billing enabled
- Gmail API enabled
- Service account with appropriate permissions
- Domain with HTTPS (for production)

## Step 1: Google Cloud Project Setup

### 1.1 Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Note your **Project ID** (you'll need this for `GOOGLE_CLOUD_PROJECT_ID`)

### 1.2 Enable APIs

Enable the following APIs:
- Gmail API
- Cloud Pub/Sub API

```bash
# Using gcloud CLI
gcloud services enable gmail.googleapis.com
gcloud services enable pubsub.googleapis.com
```

### 1.3 Create Service Account

1. Go to **IAM & Admin** → **Service Accounts**
2. Click **Create Service Account**
3. Name: `gmail-webhook-service`
4. Description: `Service account for Gmail webhook processing`
5. Click **Create and Continue**
6. Grant roles:
   - **Pub/Sub Admin**
   - **Gmail API User**
7. Click **Done**

### 1.4 Download Service Account Key

1. Click on the created service account
2. Go to **Keys** tab
3. Click **Add Key** → **Create new key**
4. Choose **JSON** format
5. Download and save as `service-account-key.json`

## Step 2: Pub/Sub Topic and Subscription Setup

### 2.1 Create Pub/Sub Topic

```bash
# Using gcloud CLI
gcloud pubsub topics create gmail-notifications
```

Or via Google Cloud Console:
1. Go to **Pub/Sub** → **Topics**
2. Click **Create Topic**
3. Topic ID: `gmail-notifications`
4. Click **Create**

### 2.2 Create Push Subscription

```bash
# Using gcloud CLI
gcloud pubsub subscriptions create gmail-webhook-subscription \
  --topic=gmail-notifications \
  --push-endpoint=https://your-domain.com/api/webhooks/gmail/messages
```

Or via Google Cloud Console:
1. Go to **Pub/Sub** → **Subscriptions**
2. Click **Create Subscription**
3. Subscription ID: `gmail-webhook-subscription`
4. Topic: `gmail-notifications`
5. Delivery type: **Push**
6. Endpoint URL: `https://your-domain.com/api/webhooks/gmail/messages`
7. Click **Create**

## Step 3: Environment Configuration

### 3.1 Backend Environment Variables

Add these to your `backend/.env` file:

```env
# Gmail OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/gmail/callback

# Google Cloud Pub/Sub Configuration
GOOGLE_CLOUD_PROJECT_ID=your_google_cloud_project_id
GOOGLE_CLOUD_KEY_FILE=/path/to/service-account-key.json

# Frontend URL (for OAuth redirects)
FRONTEND_URL=http://localhost:3000
```

### 3.2 Docker Compose Configuration

The `docker-compose.yml` already includes these variables. Update them with your actual values:

```yaml
environment:
  GOOGLE_CLIENT_ID: your_google_client_id
  GOOGLE_CLIENT_SECRET: your_google_client_secret
  GOOGLE_REDIRECT_URI: http://localhost:3001/api/auth/gmail/callback
  GOOGLE_CLOUD_PROJECT_ID: your_google_cloud_project_id
  GOOGLE_CLOUD_KEY_FILE: /app/service-account-key.json
  FRONTEND_URL: http://localhost:3000
```

## Step 4: Gmail OAuth Setup

### 4.1 Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth 2.0 Client IDs**
3. Application type: **Web application**
4. Name: `Gmail Integration`
5. Authorized redirect URIs:
   - `http://localhost:3001/api/auth/gmail/callback` (development)
   - `https://your-domain.com/api/auth/gmail/callback` (production)
6. Click **Create**
7. Copy **Client ID** and **Client Secret**

### 4.2 Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** (unless you have Google Workspace)
3. Fill in required fields:
   - App name: `Your App Name`
   - User support email: `your-email@example.com`
   - Developer contact: `your-email@example.com`
4. Add scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.modify`
5. Add test users (for development)
6. Save and continue

## Step 5: Testing the Setup

### 5.1 Test Pub/Sub Connection

```bash
cd backend
node test-gmail-webhook.js
```

### 5.2 Test Gmail OAuth Flow

1. Start your backend server
2. Go to `http://localhost:3001/api/auth/gmail`
3. Complete OAuth flow
4. Verify tokens are stored in database

### 5.3 Test Webhook Endpoint

```bash
# Test webhook endpoint
curl -X POST http://localhost:3001/api/webhooks/gmail/messages \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "data": "eyJlbWFpbEFkZHJlc3MiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiaGlzdG9yeUlkIjoiMTIzNDUifQ==",
      "messageId": "test-message-id",
      "publishTime": "2023-01-01T00:00:00.000Z"
    }
  }'
```

### 5.4 Test Gmail Watch Setup

```bash
# Setup Gmail watch for a user
curl -X POST http://localhost:3001/api/channels/email/setup-watch \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

## Step 6: Production Deployment

### 6.1 HTTPS Requirement

Gmail Pub/Sub webhooks require HTTPS in production. Use:
- **ngrok** for local testing
- **Cloudflare** for production
- **Let's Encrypt** for SSL certificates

### 6.2 Update Webhook URLs

Update your Pub/Sub subscription with production URLs:

```bash
gcloud pubsub subscriptions modify gmail-webhook-subscription \
  --push-endpoint=https://your-production-domain.com/api/webhooks/gmail/messages
```

### 6.3 Service Account Key Security

- Store service account key securely
- Use environment variables or secret management
- Never commit keys to version control

## Step 7: Monitoring and Troubleshooting

### 7.1 Check Pub/Sub Messages

```bash
# View subscription messages
gcloud pubsub subscriptions pull gmail-webhook-subscription --limit=10
```

### 7.2 Monitor Webhook Logs

Check your application logs for:
- Webhook delivery success/failure
- Gmail API errors
- Token refresh issues

### 7.3 Common Issues

**Issue**: Webhook not receiving messages
- Check HTTPS endpoint accessibility
- Verify Pub/Sub subscription configuration
- Check service account permissions

**Issue**: Gmail API quota exceeded
- Monitor API usage in Google Cloud Console
- Implement rate limiting
- Use batch requests when possible

**Issue**: Token expiration
- Implement automatic token refresh
- Monitor token expiry timestamps
- Handle refresh failures gracefully

## Step 8: Security Considerations

### 8.1 Webhook Security

- Verify Pub/Sub message authenticity
- Implement request validation
- Use HTTPS only
- Monitor for suspicious activity

### 8.2 Data Privacy

- Encrypt sensitive data
- Follow GDPR/privacy regulations
- Implement data retention policies
- Secure database access

## API Endpoints

### Webhook Endpoints

- `POST /api/webhooks/gmail/messages` - Receive Gmail notifications
- `POST /api/webhooks/gmail/setup-watch` - Setup Gmail watch (deprecated)

### User Endpoints

- `POST /api/channels/email/setup-watch` - Setup Gmail watch for user
- `GET /api/channels/email/accounts` - List Gmail accounts
- `GET /api/channels/email/:accountId/chats` - List email conversations
- `GET /api/channels/email/:accountId/chats/:chatId/messages` - Get messages
- `POST /api/channels/email/:accountId/chats/:chatId/send` - Send email

## Troubleshooting Commands

```bash
# Check Pub/Sub topic
gcloud pubsub topics list

# Check subscriptions
gcloud pubsub subscriptions list

# Test webhook endpoint
curl -X POST https://your-domain.com/api/webhooks/gmail/messages \
  -H "Content-Type: application/json" \
  -d '{"test": "message"}'

# Check Gmail API quota
gcloud logging read "resource.type=gmail_api" --limit=10
```

## Support

For issues with this setup:
1. Check Google Cloud Console logs
2. Verify environment variables
3. Test individual components
4. Review Gmail API documentation
5. Check Pub/Sub documentation
