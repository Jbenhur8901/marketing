# API Documentation

## Base URL

```
http://localhost:3000/api
```

## Authentication

All endpoints require authentication using an API key passed in the `X-API-KEY` header.

```http
X-API-KEY: sk_live_your_api_key_here
```

API keys are managed in the database and associated with a workspace. Each key has:
- **Scopes**: `read`, `write`, `admin` - control what operations are allowed
- **Rate limits**: Configurable per-key limits
- **Expiration**: Optional expiration date
- **Usage tracking**: Monitor when and how keys are used

To create your first API key, see the [API Keys Management](#api-keys-management) section below.

---

## API Keys Management

### Create API Key

```http
POST /api/api-keys
X-API-KEY: <existing-api-key-or-service-key>
```

**Request Body:**
```json
{
  "workspace_id": "uuid",
  "name": "Production API Key",
  "scopes": ["read", "write"],
  "rate_limit_per_minute": 60,
  "expires_at": "2026-12-31T23:59:59Z"
}
```

**Available Scopes:**
- `read` - Read-only access (GET requests)
- `write` - Read + Write access (GET, POST, PUT requests)
- `admin` - Full access (GET, POST, PUT, DELETE requests)

**Response:** `201 Created`
```json
{
  "message": "API key created successfully. Save this key securely - it will not be shown again!",
  "api_key": "sk_live_XXXXXXXXXXXXXXXXXXXX_your_key_here_XXXXXXXXXXXXXXXXXXXX",
  "key_info": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Production API Key",
    "key_prefix": "sk_live_a3f8d9e2b1c4...",
    "scopes": ["read", "write"],
    "rate_limit_per_minute": 60,
    "created_at": "2025-12-07T10:30:00Z",
    "expires_at": "2026-12-31T23:59:59Z"
  }
}
```

⚠️ **IMPORTANT**: The full API key is displayed only once. Save it securely!

### List API Keys

```http
GET /api/api-keys?workspace_id=<uuid>
X-API-KEY: <api-key>
```

**Response:** `200 OK`
```json
{
  "api_keys": [
    {
      "id": "uuid",
      "name": "Production",
      "key_prefix": "sk_live_abc123...",
      "scopes": ["read", "write"],
      "status": "active",
      "rate_limit_per_minute": 60,
      "last_used_at": "2025-12-07T10:30:00Z",
      "usage_count": 1543,
      "expires_at": null,
      "created_at": "2025-01-01T00:00:00Z"
    }
  ],
  "total": 1
}
```

### Get API Key Details

```http
GET /api/api-keys/:id
X-API-KEY: <api-key>
```

### Update API Key

```http
PUT /api/api-keys/:id
X-API-KEY: <api-key>
```

**Request Body:**
```json
{
  "name": "Updated Name",
  "scopes": ["read"],
  "rate_limit_per_minute": 30
}
```

### Revoke API Key

```http
POST /api/api-keys/:id/revoke
X-API-KEY: <api-key>
```

**Request Body:**
```json
{
  "reason": "Key compromised - security rotation"
}
```

Once revoked, the key cannot be used anymore.

### Delete API Key

```http
DELETE /api/api-keys/:id
X-API-KEY: <api-key>
```

Permanent deletion (recommended: use `revoke` instead).

### Get API Key Usage Statistics

```http
GET /api/api-keys/:id/usage
X-API-KEY: <api-key>
```

**Response:** `200 OK`
```json
{
  "usage": {
    "total_requests": 1543,
    "last_used_at": "2025-12-07T10:30:00Z",
    "last_used_ip": "192.168.1.1",
    "days_active": 45,
    "avg_requests_per_day": 34
  }
}
```

---

## Workspace Endpoints

### List Workspaces

```http
GET /api/workspaces
X-API-KEY: <api-key>
```

**Response:** `200 OK`
```json
{
  "workspaces": [
    {
      "id": "uuid",
      "name": "My Workspace",
      "role": "admin"
    }
  ]
}
```

### Create Workspace

```http
POST /api/workspaces
X-API-KEY: <api-key>
```

**Request Body:**
```json
{
  "name": "My New Workspace"
}
```

### Connect WhatsApp

```http
POST /api/workspaces/:id/connect-whatsapp
X-API-KEY: <api-key>
```

**Request Body:**
```json
{
  "whatsapp_business_account_id": "123456789",
  "whatsapp_phone_number_id": "987654321",
  "whatsapp_access_token": "EAAxxxxx"
}
```

**Response:** `200 OK`
```json
{
  "workspace": { ... },
  "webhook_url": "https://your-domain.com/api/whatsapp/webhook"
}
```

---

## Bot Endpoints

### List Bots

```http
GET /api/bots?workspace_id=<uuid>
X-API-KEY: <api-key>
```

### Create Bot

```http
POST /api/bots
X-API-KEY: <api-key>
```

**Request Body:**
```json
{
  "workspace_id": "uuid",
  "name": "Customer Support Bot",
  "description": "Handles customer inquiries"
}
```

### Update Bot Flow

```http
PUT /api/bots/:id/flow
X-API-KEY: <api-key>
```

**Request Body:**
```json
{
  "flow_json": {
    "nodes": [
      {
        "id": "node_1",
        "type": "trigger",
        "data": {
          "trigger_type": "keyword",
          "keywords": ["hi", "hello"]
        }
      },
      {
        "id": "node_2",
        "type": "send_message",
        "data": {
          "message": "Hello! How can I help you?"
        }
      }
    ],
    "edges": [
      { "source": "node_1", "target": "node_2" }
    ]
  }
}
```

### Activate Bot

```http
POST /api/bots/:id/activate
X-API-KEY: <api-key>
```

---

## Contact Endpoints

### List Contacts

```http
GET /api/contacts?workspace_id=<uuid>&page=1&limit=50
X-API-KEY: <api-key>
```

**Query Parameters:**
- `workspace_id` (required)
- `page` (optional, default: 1)
- `limit` (optional, default: 50, max: 100)
- `search` (optional) - Search in phone, name, email
- `tags` (optional) - Filter by tags
- `whatsapp_verified` (optional) - true/false
- `opted_in` (optional) - true/false

**Response:** `200 OK`
```json
{
  "contacts": [
    {
      "id": "uuid",
      "phone": "+33612345678",
      "name": "John Doe",
      "email": "john@example.com",
      "tags": ["customer", "vip"],
      "whatsapp_verified": true,
      "opted_in": true
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3
  }
}
```

### Create Contact

```http
POST /api/contacts
X-API-KEY: <api-key>
```

**Request Body:**
```json
{
  "workspace_id": "uuid",
  "phone": "+33612345678",
  "name": "John Doe",
  "email": "john@example.com",
  "custom_fields": {
    "company": "Acme Corp",
    "position": "CEO"
  },
  "tags": ["customer", "vip"]
}
```

### Import Contacts

```http
POST /api/contacts/import
X-API-KEY: <api-key>
```

**Request Body:**
```json
{
  "workspace_id": "uuid",
  "contacts": [
    {
      "phone": "+33612345678",
      "name": "John Doe",
      "tags": ["customer"]
    },
    {
      "phone": "+33698765432",
      "name": "Jane Smith"
    }
  ]
}
```

### Export Contacts to CSV

```http
GET /api/contacts/export?workspace_id=<uuid>&format=csv
X-API-KEY: <api-key>
```

Returns a CSV file with all contacts.

---

## Conversation Endpoints

### List Conversations

```http
GET /api/conversations?workspace_id=<uuid>&status=bot
X-API-KEY: <api-key>
```

**Query Parameters:**
- `workspace_id` (required)
- `status` (optional) - bot/human/closed
- `assigned_to` (optional) - User UUID
- `page`, `limit`

### Get Conversation with Messages

```http
GET /api/conversations/:id
X-API-KEY: <api-key>
```

**Response:** `200 OK`
```json
{
  "conversation": {
    "id": "uuid",
    "status": "bot",
    "contact": {
      "id": "uuid",
      "phone": "+33612345678",
      "name": "John Doe"
    }
  },
  "messages": [
    {
      "id": "uuid",
      "direction": "incoming",
      "content": "Hello",
      "type": "text",
      "timestamp": "2024-01-01T10:00:00Z"
    }
  ]
}
```

### Send Manual Message

```http
POST /api/conversations/:id/messages
X-API-KEY: <api-key>
```

**Request Body:**
```json
{
  "content": "Thank you for contacting us!",
  "type": "text"
}
```

### Take Over Conversation

```http
POST /api/conversations/:id/takeover
X-API-KEY: <api-key>
```

### Export Conversation to CSV

```http
GET /api/conversations/:id/export?format=csv
X-API-KEY: <api-key>
```

Returns a CSV file with all messages in the conversation.

---

## Bulk Verification Endpoints

### Start Verification Job

```http
POST /api/bulk-verification/start
X-API-KEY: <api-key>
```

**Request Body:**
```json
{
  "workspace_id": "uuid",
  "phone_numbers": [
    "+33612345678",
    "+33698765432",
    "+1234567890"
  ],
  "auto_add_to_contacts": true
}
```

**Response:** `201 Created`
```json
{
  "job": {
    "id": "uuid",
    "status": "pending",
    "total_numbers": 3
  }
}
```

### Get Job Status

```http
GET /api/bulk-verification/:jobId
X-API-KEY: <api-key>
```

**Response:** `200 OK`
```json
{
  "job": {
    "id": "uuid",
    "status": "processing",
    "total_numbers": 1000,
    "processed_count": 450,
    "verified_count": 420,
    "failed_count": 30,
    "percentage": 45
  }
}
```

### Get Verification Results

```http
GET /api/bulk-verification/:jobId/results?page=1&limit=50
X-API-KEY: <api-key>
```

**Query Parameters:**
- `status` (optional) - verified/failed
- `whatsapp_exists` (optional) - true/false

**Response:** `200 OK`
```json
{
  "results": [
    {
      "phone": "+33612345678",
      "whatsapp_exists": true,
      "wa_id": "33612345678",
      "status": "verified"
    }
  ],
  "pagination": { ... }
}
```

---

## Broadcast Endpoints

### Create Template

```http
POST /api/broadcast-templates
X-API-KEY: <api-key>
```

**Request Body:**
```json
{
  "workspace_id": "uuid",
  "name": "Welcome Template",
  "content": "Hello {{name}}, welcome to our service!",
  "variables": ["name"],
  "category": "MARKETING",
  "language": "en"
}
```

### Create Broadcast Campaign

```http
POST /api/broadcasts
X-API-KEY: <api-key>
```

**Request Body:**
```json
{
  "workspace_id": "uuid",
  "name": "New Year Campaign",
  "message_content": "Happy New Year {{name}}! Special offer: {{offer}}",
  "target_type": "filtered",
  "target_filters": {
    "tags": ["customer"],
    "custom_fields": {
      "country": "France"
    }
  },
  "rate_limit": 10,
  "scheduled_at": "2024-01-01T00:00:00Z"
}
```

**Target Types:**
- `all` - All opted-in verified contacts
- `filtered` - Contacts matching filters
- `specific` - Specific contact IDs

### Get Campaign Status

```http
GET /api/broadcasts/:id
X-API-KEY: <api-key>
```

**Response:** `200 OK`
```json
{
  "campaign": {
    "id": "uuid",
    "name": "New Year Campaign",
    "status": "processing",
    "total_recipients": 1000,
    "sent_count": 450,
    "delivered_count": 440,
    "read_count": 200,
    "failed_count": 10
  }
}
```

### Pause/Resume/Cancel Campaign

```http
POST /api/broadcasts/:id/pause
POST /api/broadcasts/:id/resume
POST /api/broadcasts/:id/cancel
X-API-KEY: <api-key>
```

### Export Broadcast Results to CSV

```http
GET /api/broadcasts/:id/export?format=csv
X-API-KEY: <api-key>
```

Returns a CSV file with all broadcast results.

---

## Analytics Endpoints

### Overview Stats

```http
GET /api/analytics/overview?workspace_id=<uuid>
X-API-KEY: <api-key>
```

**Response:** `200 OK`
```json
{
  "overview": {
    "total_contacts": 5000,
    "active_contacts": 1200,
    "total_conversations": 3000,
    "messages_sent": 15000,
    "messages_received": 12000,
    "active_bots": 3
  }
}
```

### Conversation Analytics

```http
GET /api/analytics/conversations?workspace_id=<uuid>&period=7d
X-API-KEY: <api-key>
```

**Query Parameters:**
- `period` - 7d, 30d, 90d

**Response:** `200 OK`
```json
{
  "conversations": {
    "by_status": {
      "bot": 150,
      "human": 30,
      "closed": 200
    },
    "over_time": {
      "2024-01-01": 10,
      "2024-01-02": 15
    },
    "total": 380
  }
}
```

### Broadcast Analytics

```http
GET /api/analytics/broadcasts?workspace_id=<uuid>&period=30d
X-API-KEY: <api-key>
```

**Response:** `200 OK`
```json
{
  "broadcasts": {
    "total_campaigns": 5,
    "total_sent": 10000,
    "delivery_rate": 98.5,
    "read_rate": 45.2,
    "failure_rate": 1.5
  }
}
```

---

## Monitoring Endpoints

### Health Check

```http
GET /api/monitoring/health
```

**No authentication required.**

**Response:** `200 OK`
```json
{
  "status": "healthy",
  "timestamp": "2025-12-07T10:30:00Z",
  "uptime": 86400,
  "database": "connected",
  "whatsapp_api": "reachable"
}
```

### Dead Letter Queue Status

```http
GET /api/monitoring/dlq
X-API-KEY: <api-key>
```

**Response:** `200 OK`
```json
{
  "total_failed": 45,
  "pending_retry": 12,
  "exhausted": 3,
  "recent_failures": [
    {
      "id": "uuid",
      "message_type": "text",
      "attempt_count": 2,
      "last_error": "Network timeout",
      "next_retry_at": "2025-12-07T11:00:00Z"
    }
  ]
}
```

### System Metrics

```http
GET /api/monitoring/metrics
X-API-KEY: <api-key>
```

**Response:** `200 OK`
```json
{
  "messages": {
    "last_hour": 450,
    "last_24h": 8500,
    "success_rate": 98.5
  },
  "conversations": {
    "active": 120,
    "bot_handled": 85,
    "human_handled": 35
  },
  "broadcasts": {
    "active_campaigns": 2,
    "queued_messages": 1500
  }
}
```

---

## WhatsApp Webhook

### Webhook Verification (GET)

```http
GET /api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=<challenge>
```

Meta will call this to verify your webhook.

**No authentication required** - verified by Meta's challenge parameter.

### Webhook Events (POST)

```http
POST /api/whatsapp/webhook
X-Hub-Signature-256: sha256=<signature>
```

Receives WhatsApp events (messages, status updates).

**No X-API-KEY required** - authenticated via HMAC-SHA256 signature verification.

---

## Error Responses

### Validation Error

**Status:** `400 Bad Request`
```json
{
  "error": "Validation error",
  "details": [
    {
      "field": "phone",
      "message": "Phone number must be in E.164 format"
    }
  ]
}
```

### Authentication Error

**Status:** `401 Unauthorized`
```json
{
  "error": "API Key required",
  "message": "Please provide X-API-KEY header"
}
```

### Invalid API Key

**Status:** `403 Forbidden`
```json
{
  "error": "Invalid API Key",
  "message": "The provided API key is not valid, expired, or has been revoked"
}
```

### Insufficient Permissions

**Status:** `403 Forbidden`
```json
{
  "error": "Forbidden",
  "message": "This operation requires 'write' scope"
}
```

### Not Found

**Status:** `404 Not Found`
```json
{
  "error": "Resource not found"
}
```

### Rate Limit Exceeded

**Status:** `429 Too Many Requests`
```json
{
  "error": "Too many requests",
  "message": "Rate limit exceeded. Please try again later."
}
```

---

## Rate Limits

Rate limits are configurable per API key:

- **General API**: Default 100 requests/minute (configurable per key)
- **Bulk Verification**: 10 jobs/hour per workspace
- **Webhooks**: 1000 requests/minute (WhatsApp can send many webhooks)
- **Broadcasting**: Configurable per campaign (default 10 msg/sec, max 100 msg/sec)

Rate limit information is included in response headers:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1638360000
```

---

## Pagination

List endpoints support pagination:

```http
GET /api/contacts?page=2&limit=50
```

Response includes pagination metadata:

```json
{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 50,
    "total": 500,
    "pages": 10
  }
}
```

**Limits:**
- Default: 50 items per page
- Maximum: 100 items per page

---

## Filtering

Many list endpoints support filtering:

```http
GET /api/contacts?search=john&tags=customer&whatsapp_verified=true
```

Common filter parameters:
- `search` - Text search across multiple fields
- `tags` - Filter by tags (comma-separated)
- `status` - Filter by status
- `created_after` - ISO 8601 date
- `created_before` - ISO 8601 date

---

## Real-time Updates

Subscribe to Supabase Realtime channels for live updates:

```javascript
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const channel = supabase
  .channel('conversations')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `conversation_id=eq.${conversationId}`
  }, (payload) => {
    console.log('New message:', payload.new);
  })
  .subscribe();
```

See [REALTIME_GUIDE.md](./REALTIME_GUIDE.md) for detailed integration examples.

---

## Security Best Practices

### API Key Management

1. **Never commit API keys** to version control
2. **Use environment variables** to store keys in your application
3. **Rotate keys regularly** (recommended: every 90 days)
4. **Use different keys** for development, staging, and production
5. **Revoke compromised keys** immediately
6. **Use minimum required scopes** (principle of least privilege)
7. **Set expiration dates** for temporary keys
8. **Monitor key usage** regularly via `/api/api-keys/:id/usage`

### Request Security

1. **Always use HTTPS** in production
2. **Validate all input** on the client side
3. **Handle errors gracefully** without exposing sensitive information
4. **Implement request timeouts** to prevent hanging requests
5. **Log security events** (failed auth attempts, unusual usage patterns)

---

## Integration Examples

### JavaScript/Node.js

```javascript
const API_KEY = process.env.API_KEY;
const API_URL = 'https://api.yourdomain.com/api';

async function getContacts(workspaceId) {
  const response = await fetch(`${API_URL}/contacts?workspace_id=${workspaceId}`, {
    headers: {
      'X-API-KEY': API_KEY,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

async function createContact(workspaceId, contactData) {
  const response = await fetch(`${API_URL}/contacts`, {
    method: 'POST',
    headers: {
      'X-API-KEY': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      workspace_id: workspaceId,
      ...contactData
    })
  });

  return response.json();
}
```

### Python

```python
import requests
import os

API_KEY = os.getenv('API_KEY')
API_URL = 'https://api.yourdomain.com/api'

headers = {
    'X-API-KEY': API_KEY,
    'Content-Type': 'application/json'
}

def get_contacts(workspace_id):
    response = requests.get(
        f'{API_URL}/contacts',
        params={'workspace_id': workspace_id},
        headers=headers
    )
    response.raise_for_status()
    return response.json()

def create_contact(workspace_id, contact_data):
    data = {'workspace_id': workspace_id, **contact_data}
    response = requests.post(
        f'{API_URL}/contacts',
        json=data,
        headers=headers
    )
    return response.json()
```

### cURL

```bash
# Get contacts
curl -X GET "https://api.yourdomain.com/api/contacts?workspace_id=uuid" \
  -H "X-API-KEY: sk_live_your_api_key_here"

# Create contact
curl -X POST "https://api.yourdomain.com/api/contacts" \
  -H "X-API-KEY: sk_live_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "uuid",
    "phone": "+33612345678",
    "name": "John Doe"
  }'
```

---

## Postman Collection

Import the Postman collection from `postman_collection.json` for easy API testing.

The collection includes:
- Pre-configured X-API-KEY authentication
- All endpoint examples
- Environment variables for easy switching between dev/prod
- Sample requests and responses

---

## Additional Resources

- **[API Keys Guide](./API_KEYS_GUIDE.md)** - Detailed API key management documentation
- **[Realtime Guide](./REALTIME_GUIDE.md)** - Supabase Realtime integration
- **[Deployment Guide](./DEPLOYMENT.md)** - Production deployment instructions
- **[README](./README.md)** - Project overview and quick start

---

## Support

For issues or questions:
1. Check this documentation first
2. Review the error response for specific details
3. Check the [GitHub repository](https://github.com/yourusername/whatsapp-chatbot-platform)
4. Contact support with relevant error messages and request IDs
