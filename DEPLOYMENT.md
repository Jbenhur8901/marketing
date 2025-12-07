# Deployment Guide

This guide covers deploying the WhatsApp Chatbot Platform backend to various platforms.

## Prerequisites

- Supabase project created
- WhatsApp Business Account configured
- Environment variables ready

## Database Setup (Supabase)

### Option 1: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Run migrations in order:
   - `supabase/migrations/schema.sql` - Complete database schema with all tables
   - `supabase/migrations/rls_policies.sql` - Row Level Security policies
   - `supabase/migrations/helper_functions.sql` - Helper functions and triggers

### Option 2: Using Supabase CLI

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Push migrations
supabase db push
```

## Backend Deployment Options

### 1. Railway

**Steps:**

1. Create account at [Railway.app](https://railway.app)

2. Create new project from GitHub repo

3. Add environment variables:
   ```
   SUPABASE_URL=...
   SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   WHATSAPP_VERIFY_TOKEN=...
   NODE_ENV=production
   PORT=3000
   ```

   **Note:** API keys are managed in the database (`api_keys` table). Use `POST /api/api-keys` to create keys for authentication.

4. Deploy automatically from Git

5. Get your deployment URL (e.g., `https://your-app.up.railway.app`)

### 2. Render

**Steps:**

1. Create account at [Render.com](https://render.com)

2. Create new Web Service from GitHub

3. Configure:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node

4. Add environment variables (same as Railway above)

5. Deploy

### 3. Fly.io

**Steps:**

1. Install Fly CLI:
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. Login:
   ```bash
   fly auth login
   ```

3. Create `fly.toml`:
   ```toml
   app = "whatsapp-chatbot-platform"

   [build]
     builder = "heroku/buildpacks:20"

   [[services]]
     internal_port = 3000
     protocol = "tcp"

     [[services.ports]]
       handlers = ["http"]
       port = 80

     [[services.ports]]
       handlers = ["tls", "http"]
       port = 443

   [env]
     NODE_ENV = "production"
     PORT = "3000"
   ```

4. Set secrets:
   ```bash
   fly secrets set SUPABASE_URL=...
   fly secrets set SUPABASE_ANON_KEY=...
   fly secrets set SUPABASE_SERVICE_ROLE_KEY=...
   fly secrets set WHATSAPP_VERIFY_TOKEN=...
   ```

   **Note:** API keys are managed in the database (`api_keys` table). Use `POST /api/api-keys` to create keys for authentication.

5. Deploy:
   ```bash
   fly deploy
   ```

### 4. Docker Deployment

**Dockerfile:**

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Start server
CMD ["npm", "start"]
```

**Docker Compose:**

```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - WHATSAPP_VERIFY_TOKEN=${WHATSAPP_VERIFY_TOKEN}
    restart: unless-stopped

# Note: API keys are managed in the database (api_keys table)
# Use POST /api/api-keys to create keys for authentication
```

**Build and run:**

```bash
docker build -t whatsapp-chatbot-api .
docker run -p 3000:3000 --env-file .env whatsapp-chatbot-api
```

### 5. VPS (Ubuntu/Debian)

**Requirements:**
- Ubuntu 20.04+ or Debian 11+
- Node.js 18+
- PM2 for process management
- Nginx as reverse proxy

**Steps:**

1. **Install Node.js:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Install PM2:**
   ```bash
   sudo npm install -g pm2
   ```

3. **Clone and setup:**
   ```bash
   git clone <repository-url>
   cd whatsapp-chatbot-platform
   npm install
   ```

4. **Create `.env` file:**
   ```bash
   cp .env.example .env
   nano .env  # Edit with your values
   ```

5. **Start with PM2:**
   ```bash
   pm2 start src/index.js --name whatsapp-api
   pm2 save
   pm2 startup
   ```

6. **Setup Nginx:**
   ```bash
   sudo apt-get install nginx
   sudo nano /etc/nginx/sites-available/whatsapp-api
   ```

   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

   ```bash
   sudo ln -s /etc/nginx/sites-available/whatsapp-api /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

7. **Setup SSL with Let's Encrypt:**
   ```bash
   sudo apt-get install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

## WhatsApp Configuration

After deployment, configure WhatsApp webhook:

1. Get your deployment URL (e.g., `https://your-domain.com`)

2. In Meta Business Manager:
   - Go to WhatsApp > Configuration
   - Click "Edit" on Webhook
   - **Callback URL**: `https://your-domain.com/api/whatsapp/webhook`
   - **Verify Token**: Your `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to fields: `messages`, `message_status`

3. Test webhook by sending a message to your WhatsApp number

## Environment Variables

Required for production:

```env
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# WhatsApp
WHATSAPP_API_URL=https://graph.facebook.com/v18.0
WHATSAPP_VERIFY_TOKEN=your-secure-random-token

# Server
NODE_ENV=production
PORT=3000

# Optional
CORS_ORIGIN=https://your-frontend-domain.com
API_RATE_LIMIT_REQUESTS=100
API_RATE_LIMIT_WINDOW_MS=60000
BULK_VERIFICATION_MAX_JOBS_PER_HOUR=10
BROADCAST_DEFAULT_RATE_LIMIT=10
```

**Authentication:**
- API keys are managed in the database (`api_keys` table)
- After deployment, create your first API key using `POST /api/api-keys`
- See [API_KEYS_GUIDE.md](./API_KEYS_GUIDE.md) for detailed instructions

## Health Checks

Configure health check endpoints:

- **Health**: `GET /health` - Returns `{"status": "ok"}`
- **Root**: `GET /` - Returns API info

## Monitoring

### Logs

**PM2:**
```bash
pm2 logs whatsapp-api
```

**Docker:**
```bash
docker logs -f container-name
```

### Recommended Tools

- **Uptime Monitoring**: UptimeRobot, Pingdom
- **Error Tracking**: Sentry
- **Performance**: New Relic, Datadog
- **Logs**: Logtail, Papertrail

## Scaling

### Horizontal Scaling

For high traffic, deploy multiple instances behind a load balancer:

1. Deploy to multiple servers/containers
2. Use Nginx or cloud load balancer
3. Ensure session affinity for webhooks

### Database

Supabase automatically scales. For very high traffic:
- Enable Supabase read replicas
- Use connection pooling
- Add database indexes (already included)

## Backup

### Database

Supabase provides automatic backups. For additional safety:

```bash
# Export schema
pg_dump -h db.xxxxx.supabase.co -U postgres -s > schema.sql

# Export data
pg_dump -h db.xxxxx.supabase.co -U postgres -a > data.sql
```

### Code

- Use Git for version control
- Tag releases
- Keep production branch protected

## Security Checklist

- [ ] HTTPS enabled (SSL certificate)
- [ ] Environment variables secured
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] Database RLS enabled
- [ ] Webhook signature verification enabled
- [ ] Regular security updates
- [ ] API keys created with minimum required scopes
- [ ] API key rotation policy established (every 90 days recommended)
- [ ] Firewall configured (if VPS)

## Troubleshooting

### Webhook not receiving messages

1. Check webhook URL is accessible (test with curl)
2. Verify `WHATSAPP_VERIFY_TOKEN` matches
3. Check webhook is subscribed to `messages` field
4. Review application logs

### Database connection errors

1. Verify Supabase credentials
2. Check network connectivity
3. Ensure IP not blocked (if using IP restrictions)

### High memory usage

1. Check for memory leaks
2. Restart process with PM2: `pm2 restart whatsapp-api`
3. Scale horizontally if needed

## Support

For deployment issues:
- Check logs first
- Review environment variables
- Test health endpoint
- Contact support if needed

## Cost Estimates

### Typical Monthly Costs

**Small (< 10K messages/month):**
- Supabase: Free tier
- Hosting (Railway/Render): $5-15
- **Total: ~$10/month**

**Medium (100K messages/month):**
- Supabase: Free tier or $25
- Hosting: $20-50
- **Total: ~$50/month**

**Large (1M+ messages/month):**
- Supabase: $25-100
- Hosting: $100-500
- **Total: $200-600/month**

*WhatsApp messaging is free for the first 1000 conversations/month*
