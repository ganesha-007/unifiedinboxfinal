# WhatsApp & Instagram Integration Platform - Client Guide

## 🎯 **Project Overview**

This is a **multi-tenant messaging platform** that allows users to manage WhatsApp and Instagram messages in a unified inbox. Each user can connect their own UniPile API credentials and manage their social media accounts independently.

## ✨ **Key Features**

- **Multi-tenant Architecture**: Each user has isolated data and credentials
- **WhatsApp Integration**: Send and receive WhatsApp messages
- **Instagram Integration**: Send and receive Instagram Direct Messages
- **Unified Inbox**: Manage all messages in one interface
- **Real-time Updates**: Live message notifications
- **User Onboarding**: Easy setup with UniPile credentials

## 🚀 **Quick Start Guide**

### **Prerequisites**

1. **Node.js** (v16 or higher)
2. **PostgreSQL** database
3. **UniPile API Account** (for each user)
4. **ngrok** (for webhook testing)

### **Installation Steps**

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd whatsapp-integration
   ```

2. **Install dependencies**
   ```bash
   # Backend
   cd backend
   npm install
   
   # Frontend
   cd ../frontend
   npm install
   ```

3. **Database Setup**
   ```bash
   # Create PostgreSQL database
   createdb whatsapp_integration
   
   # Run migrations
   cd backend
   npm run migrate
   ```

4. **Environment Configuration**
   
   Create `backend/.env` file:
   ```env
   # Database
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=whatsapp_integration
   DB_USER=postgres
   DB_PASSWORD=your_password
   
   # JWT
   JWT_SECRET=your_jwt_secret_here_change_this_in_production
   
   # Server
   PORT=3001
   ```

   Optional Redis (recommended for caching/queues):
   ```env
   REDIS_URL=redis://localhost:6379
   REDIS_DB=0
   REDIS_TLS=false
   ```

5. **Start the application**
   ```bash
   # Terminal 1 - Backend
   cd backend
   npm run dev
   
   # Terminal 2 - Frontend
   cd frontend
   npm start
   ```

6. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

## 👥 **User Onboarding Process**

### **Step 1: User Registration**
1. Go to http://localhost:3000
2. Click "Login" 
3. Enter any email and user ID (e.g., `user@example.com`, `user123`)
4. System will check if user has UniPile credentials

### **Step 2: UniPile Credentials Setup**
If user doesn't have credentials, they'll be redirected to onboarding:

1. **UniPile API Key**: Get from your UniPile dashboard
2. **UniPile API URL**: Usually `https://api22.unipile.com:15284/api/v1`
3. **WhatsApp Phone**: Your WhatsApp number (e.g., `919876543210@s.whatsapp.net`)
4. **Webhook URL**: Your ngrok URL + `/api/webhooks/unipile/messages`

### **Step 3: Account Selection**
1. Click "Load Available Accounts" to see your UniPile accounts
2. Select which WhatsApp/Instagram accounts to connect
3. Click "Save Credentials & Connect Accounts"

### **Step 4: Start Messaging**
1. Go to "Connections" to see connected accounts
2. Click "View Messages" to open the inbox
3. Switch between WhatsApp and Instagram tabs
4. Start sending and receiving messages!

## 🔧 **Configuration Guide**
### **Redis Setup**

1. Docker Compose includes a `redis` service. Start the stack:
   ```bash
   docker compose up -d redis
   ```
2. The backend will use Redis automatically when `REDIS_URL` is set.
3. The app provides:
   - Basic cache wrapper: `backend/src/services/cache.ts` (getJson/setJson/del)
   - KV helpers: `backend/src/services/kv.ts`
   - `/ready` endpoint validates Redis connectivity when configured.


### **UniPile Setup**

1. **Create UniPile Account**
   - Go to https://dashboard.unipile.com
   - Sign up and get your API credentials

2. **Connect WhatsApp**
   - In UniPile dashboard, connect your WhatsApp account
   - Note down the account ID

3. **Connect Instagram**
   - In UniPile dashboard, connect your Instagram account
   - Note down the account ID

4. **Set up Webhooks**
   - In UniPile dashboard, add webhook URL: `https://your-ngrok-url.ngrok.io/api/webhooks/unipile/messages`
   - Enable message events

### **ngrok Setup (for webhooks)**

1. **Install ngrok**
   ```bash
   npm install -g ngrok
   ```

2. **Start ngrok**
   ```bash
   ngrok http 3001
   ```

3. **Copy the ngrok URL** (e.g., `https://abc123.ngrok.io`)
4. **Use this URL** in UniPile webhook settings

## 📱 **Using the Platform**

### **Connections Page**
- **View connected accounts** for WhatsApp and Instagram
- **Connect new accounts** using the onboarding flow
- **Switch between providers** using the tabs

### **Inbox Page**
- **Unified messaging interface** for all platforms
- **Real-time message updates** via WebSocket
- **Send messages** to any connected account
- **View message history** with timestamps

### **Provider Switching**
- **WhatsApp Tab**: Shows WhatsApp chats and messages
- **Instagram Tab**: Shows Instagram Direct Messages
- **Automatic account loading** when switching providers

## 🔒 **Multi-Tenancy Features**

### **User Isolation**
- Each user has **separate UniPile credentials**
- **Isolated data** - users can't see each other's messages
- **Independent account management**
- **Secure credential storage**

### **Account Management**
- **One account per user**: Each external account can only be connected by one user
- **User-specific API keys**: Each user provides their own UniPile credentials
- **Automatic data filtering**: Users only see their own data

## 🛠️ **Technical Architecture**

### **Backend (Node.js + Express)**
- **RESTful API** for account and message management
- **WebSocket support** for real-time updates
- **JWT authentication** for user sessions
- **PostgreSQL database** for data persistence
- **UniPile API integration** for messaging

### **Frontend (React + TypeScript)**
- **Modern React** with hooks and context
- **Real-time updates** via Socket.io
- **Responsive design** for all devices
- **Provider-agnostic** messaging interface

### **Database Schema**
- **users**: User authentication and profiles
- **user_credentials**: UniPile API credentials per user
- **channels_account**: Connected social media accounts
- **channels_chat**: Chat conversations
- **channels_message**: Individual messages

## 🚨 **Troubleshooting**

### **Common Issues**

1. **"Account not found" error**
   - Check if UniPile credentials are correct
   - Verify account is connected in UniPile dashboard

2. **Messages not loading**
   - Check webhook URL in UniPile dashboard
   - Ensure ngrok is running and accessible

3. **Instagram tab showing WhatsApp chats**
   - This was a data inconsistency issue (now fixed)
   - Contact support if it persists

4. **"No UniPile credentials found"**
   - Complete the onboarding process
   - Ensure credentials are saved correctly

### **Debug Tools**

1. **Data Consistency Check**
   ```bash
   curl http://localhost:3001/api/webhooks/consistency-check
   ```

2. **Account Status Check**
   ```bash
   curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
        http://localhost:3001/api/channels/whatsapp/accounts
   ```

## 📞 **Support & Maintenance**

### **Logs and Monitoring**
- **Backend logs**: Check terminal running `npm run dev`
- **Database logs**: Check PostgreSQL logs
- **UniPile logs**: Check UniPile dashboard for API calls

### **Data Backup**
- **Regular database backups** recommended
- **Export user credentials** for migration
- **UniPile account backups** handled by UniPile

### **Scaling Considerations**
- **Database connection pooling** for multiple users
- **Redis caching** for improved performance
- **Load balancing** for high traffic
- **CDN** for static assets

## 🎯 **Next Steps**

### **Production Deployment**
1. **Set up production database**
2. **Configure environment variables**
3. **Set up SSL certificates**
4. **Configure domain and DNS**
5. **Set up monitoring and logging**

### **Feature Enhancements**
- **Message search and filtering**
- **File and media sharing**
- **Message scheduling**
- **Bulk messaging**
- **Analytics and reporting**

## 📋 **API Documentation**

### **Authentication**
```bash
# Login
POST /api/auth/login
{
  "email": "user@example.com",
  "userId": "user123"
}
```

### **Account Management**
```bash
# Get accounts
GET /api/channels/{provider}/accounts
Authorization: Bearer JWT_TOKEN

# Connect account
POST /api/channels/{provider}/connect
{
  "accountId": "account_id_from_unipile"
}
```

### **Messaging**
```bash
# Get chats
GET /api/channels/{provider}/{accountId}/chats

# Get messages
GET /api/channels/{provider}/{accountId}/chats/{chatId}/messages

# Send message
POST /api/channels/{provider}/{accountId}/chats/{chatId}/send
{
  "body": "Your message text"
}
```

## 🎉 **Congratulations!**

You now have a fully functional multi-tenant messaging platform with:
- ✅ **WhatsApp Integration**
- ✅ **Instagram Integration** 
- ✅ **Multi-tenant Architecture**
- ✅ **User Onboarding**
- ✅ **Real-time Messaging**
- ✅ **Data Consistency**

**Ready for production deployment!** 🚀

---

**For technical support or questions, contact the development team.**
