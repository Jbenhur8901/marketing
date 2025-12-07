# WhatsApp Chatbot Platform - Backend API

Complete REST API backend for a WhatsApp chatbot platform using Supabase and WhatsApp Business Cloud API.

## Features

- 🤖 **Bot Flow Builder** - Visual flow builder with nodes (triggers, messages, questions, conditions, HTTP requests)
- 💬 **Conversation Management** - Unified inbox with bot/human handoff
- 📞 **Bulk Number Verification** - Verify WhatsApp numbers using official API (100% free)
- 📢 **Broadcasting** - Send mass messages with rate limiting and tracking
- 👥 **Contact Management** - Organize contacts with tags, custom fields, and segmentation
- 📊 **Analytics** - Track conversations, messages, broadcasts, and bot performance
- 🔐 **Authentication** - API Key Management with RLS (Row Level Security)
- ⚡ **Realtime** - Live updates using Supabase Realtime
- 🔒 **Security** - Webhook signature verification, rate limiting, input validation

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: PostgreSQL (via Supabase)
- **Auth**: API Key Management (database-stored, per-workspace keys)
- **WhatsApp**: WhatsApp Business Cloud API (Meta Graph API v18.0+)
- **Realtime**: Supabase Realtime subscriptions

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Setup

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required environment variables:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# WhatsApp
WHATSAPP_VERIFY_TOKEN=your-webhook-verify-token

# Note: API keys are managed in database (api_keys table)
# No JWT_SECRET needed - use POST /api/api-keys to create keys

# Server
PORT=3000
NODE_ENV=development
```

### 3. Database Setup

Run Supabase migrations in your Supabase dashboard SQL editor:

Execute all migrations in order:
1. `supabase/migrations/20240101000001_initial_schema.sql`
2. `supabase/migrations/20240101000002_rls_policies.sql`
3. `supabase/migrations/20240101000003_helper_functions.sql`
4. `supabase/migrations/20240101000004_dead_letter_queue.sql`
5. `supabase/migrations/20240101000005_api_keys_management.sql`

### 4. Start Server

```bash
# Development
npm run dev

# Production
npm start
```

Server will run on `http://localhost:3000`

### 5. API Key Setup

Generate an API key for your workspace:

```bash
curl -X POST http://localhost:3000/api/api-keys \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "your-workspace-uuid",
    "name": "Production API Key",
    "scopes": ["read", "write"]
  }'
```

Save the returned API key securely - it's shown only once!

### 6. Use API Key in Requests

Include the API key in all requests:

```bash
curl http://localhost:3000/api/contacts \
  -H "X-API-KEY: sk_live_your_api_key_here"
```

```javascript
// JavaScript/Frontend example
fetch('http://localhost:3000/api/contacts', {
  headers: {
    'X-API-KEY': 'sk_live_your_api_key_here'
  }
});
```

## Documentation

- **[API Documentation](./API_DOCUMENTATION.md)** - Complete API reference
- **[API Keys Guide](./API_KEYS_GUIDE.md)** - API key management documentation
- **[Realtime Guide](./REALTIME_GUIDE.md)** - Supabase Realtime integration
- **[Deployment Guide](./DEPLOYMENT.md)** - Production deployment instructions
- **[Postman Collection](./postman_collection.json)** - Import for easy testing

## Project Structure

```
├── src/
│   ├── config/          # Configuration files
│   ├── middleware/      # Express middleware
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   └── utils/           # Utility functions
├── supabase/
│   └── migrations/      # Database migrations
├── .env.example         # Environment variables template
└── package.json
```

## Key Features

### Bot Flow Builder

Create conversational flows with visual nodes:
- Triggers (keyword, any_message, new_conversation)
- Send messages (text, images, buttons)
- Ask questions with validation
- Conditional logic
- HTTP requests to external APIs
- Human handoff

### Bulk Verification

Verify thousands of WhatsApp numbers for free:
- Uses official WhatsApp endpoint
- Processes 50 numbers per request
- 30-day caching
- Auto-add to contacts

### Broadcasting

Send mass messages with advanced features:
- Message interpolation `{{name}}`
- Contact segmentation
- Rate limiting
- Schedule for later
- Real-time tracking

## License

MIT