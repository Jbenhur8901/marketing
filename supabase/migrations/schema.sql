-- =============================================
-- COMPLETE DATABASE SCHEMA
-- WhatsApp Chatbot Platform
-- =============================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- WORKSPACES AND MEMBERS
-- ============================================

CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    whatsapp_business_account_id VARCHAR(255),
    whatsapp_phone_number_id VARCHAR(255),
    whatsapp_access_token TEXT,
    webhook_verify_token VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE workspace_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    joined_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(workspace_id, user_id)
);

-- ============================================
-- BOTS AND FLOWS
-- ============================================

CREATE TABLE bots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    flow_json JSONB DEFAULT '{"nodes": [], "edges": []}',
    triggers JSONB DEFAULT '[]',
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE flow_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    flow_json JSONB NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(bot_id, version)
);

-- ============================================
-- CONTACTS AND CONVERSATIONS
-- ============================================

CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    phone VARCHAR(20) NOT NULL,
    name VARCHAR(255),
    email VARCHAR(255),
    custom_fields JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    whatsapp_verified BOOLEAN DEFAULT FALSE,
    whatsapp_verified_at TIMESTAMP WITH TIME ZONE,
    wa_id VARCHAR(50),
    opted_in BOOLEAN DEFAULT TRUE,
    opted_out_at TIMESTAMP WITH TIME ZONE,
    last_message_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(workspace_id, phone)
);

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    contact_phone VARCHAR(20) NOT NULL,
    status VARCHAR(50) DEFAULT 'bot' CHECK (status IN ('bot', 'human', 'closed')),
    assigned_to UUID REFERENCES auth.users(id),
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    whatsapp_message_id VARCHAR(255),
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    content TEXT,
    type VARCHAR(50) DEFAULT 'text' CHECK (type IN ('text', 'image', 'video', 'document', 'audio', 'interactive', 'template')),
    media_url TEXT,
    status VARCHAR(50) DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
    error_message TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE conversation_contexts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
    current_node_id VARCHAR(255),
    waiting_for VARCHAR(255),
    variables JSONB DEFAULT '{}',
    flow_history JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(conversation_id)
);

-- ============================================
-- BULK VERIFICATION
-- ============================================

CREATE TABLE bulk_verification_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    total_numbers INTEGER NOT NULL DEFAULT 0,
    processed_count INTEGER DEFAULT 0,
    verified_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    auto_add_to_contacts BOOLEAN DEFAULT FALSE,
    results_summary JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE number_verification_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES bulk_verification_jobs(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    phone VARCHAR(20) NOT NULL,
    format_valid BOOLEAN DEFAULT FALSE,
    whatsapp_exists BOOLEAN DEFAULT FALSE,
    wa_id VARCHAR(50),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed')),
    error_message TEXT,
    verified_at TIMESTAMP WITH TIME ZONE,
    cache_expires_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- BROADCASTING
-- ============================================

CREATE TABLE broadcast_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    variables JSONB DEFAULT '[]',
    category VARCHAR(50) DEFAULT 'MARKETING' CHECK (category IN ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
    language VARCHAR(10) DEFAULT 'en',
    media_type VARCHAR(50) CHECK (media_type IN ('text', 'image', 'video', 'document')),
    media_url TEXT,
    buttons JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE broadcast_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    template_id UUID REFERENCES broadcast_templates(id),
    message_content TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text',
    target_type VARCHAR(50) DEFAULT 'all' CHECK (target_type IN ('all', 'filtered', 'specific')),
    target_filters JSONB DEFAULT '{}',
    scheduled_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'processing', 'paused', 'completed', 'failed', 'cancelled')),
    rate_limit INTEGER DEFAULT 10,
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    read_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE broadcast_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    contact_phone VARCHAR(20) NOT NULL,
    message_content TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
    whatsapp_message_id VARCHAR(255),
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT
);

-- ============================================
-- DEAD LETTER QUEUE
-- For failed messages that need manual review
-- ============================================

CREATE TABLE dead_letter_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Original message data
    message_type VARCHAR(50) NOT NULL, -- 'broadcast', 'conversation', 'whatsapp_send'
    original_payload JSONB NOT NULL,

    -- Error information
    error_code VARCHAR(50),
    error_message TEXT NOT NULL,
    error_details JSONB,

    -- Retry information
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    last_retry_at TIMESTAMP WITH TIME ZONE,
    next_retry_at TIMESTAMP WITH TIME ZONE,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'failed', -- 'failed', 'retrying', 'resolved', 'archived'
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- API KEYS MANAGEMENT
-- Each workspace can have multiple API keys
-- ============================================

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Key details
    name VARCHAR(100) NOT NULL, -- "Production API", "Development", etc.
    key_hash VARCHAR(255) NOT NULL UNIQUE, -- Hashed version of the key (never store plain)
    key_prefix VARCHAR(20) NOT NULL, -- First chars for identification

    -- Permissions & limits
    scopes JSONB DEFAULT '["read", "write"]'::jsonb,
    rate_limit_per_minute INT DEFAULT 60,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, revoked, expired

    -- Usage tracking
    last_used_at TIMESTAMP WITH TIME ZONE,
    last_used_ip INET,
    usage_count BIGINT DEFAULT 0,

    -- Expiration
    expires_at TIMESTAMP WITH TIME ZONE,

    -- Metadata
    created_by UUID,
    revoked_by UUID,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoke_reason TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Workspaces
CREATE INDEX idx_workspaces_owner ON workspaces(owner_id);
CREATE INDEX idx_workspaces_status ON workspaces(status);

-- Workspace Members
CREATE INDEX idx_workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);

-- Bots
CREATE INDEX idx_bots_workspace ON bots(workspace_id);
CREATE INDEX idx_bots_status ON bots(status);

-- Flow Versions
CREATE INDEX idx_flow_versions_bot ON flow_versions(bot_id);

-- Contacts
CREATE INDEX idx_contacts_workspace ON contacts(workspace_id);
CREATE INDEX idx_contacts_phone ON contacts(phone);
CREATE INDEX idx_contacts_wa_id ON contacts(wa_id);
CREATE INDEX idx_contacts_verified ON contacts(whatsapp_verified);
CREATE INDEX idx_contacts_opted_in ON contacts(opted_in);
CREATE INDEX idx_contacts_tags ON contacts USING GIN(tags);
CREATE INDEX idx_contacts_last_message ON contacts(last_message_at DESC);

-- Conversations
CREATE INDEX idx_conversations_workspace ON conversations(workspace_id);
CREATE INDEX idx_conversations_contact ON conversations(contact_id);
CREATE INDEX idx_conversations_bot ON conversations(bot_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_assigned ON conversations(assigned_to);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);

-- Messages
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_whatsapp_id ON messages(whatsapp_message_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX idx_messages_status ON messages(status);

-- Conversation Contexts
CREATE INDEX idx_conversation_contexts_conversation ON conversation_contexts(conversation_id);
CREATE INDEX idx_conversation_contexts_bot ON conversation_contexts(bot_id);

-- Bulk Verification
CREATE INDEX idx_bulk_verification_jobs_workspace ON bulk_verification_jobs(workspace_id);
CREATE INDEX idx_bulk_verification_jobs_status ON bulk_verification_jobs(status);
CREATE INDEX idx_bulk_verification_jobs_created ON bulk_verification_jobs(created_at DESC);
CREATE INDEX idx_number_verification_results_job ON number_verification_results(job_id);
CREATE INDEX idx_number_verification_results_phone ON number_verification_results(phone);

-- Broadcasting
CREATE INDEX idx_broadcast_templates_workspace ON broadcast_templates(workspace_id);
CREATE INDEX idx_broadcast_campaigns_workspace ON broadcast_campaigns(workspace_id);
CREATE INDEX idx_broadcast_campaigns_status ON broadcast_campaigns(status);
CREATE INDEX idx_broadcast_campaigns_scheduled ON broadcast_campaigns(scheduled_at);
CREATE INDEX idx_broadcast_messages_campaign ON broadcast_messages(campaign_id);
CREATE INDEX idx_broadcast_messages_status ON broadcast_messages(status);

-- Dead Letter Queue
CREATE INDEX idx_dlq_workspace ON dead_letter_queue(workspace_id);
CREATE INDEX idx_dlq_status ON dead_letter_queue(status);
CREATE INDEX idx_dlq_next_retry ON dead_letter_queue(next_retry_at) WHERE status = 'retrying';
CREATE INDEX idx_dlq_created ON dead_letter_queue(created_at DESC);
CREATE INDEX idx_dlq_type ON dead_letter_queue(message_type);

-- API Keys
CREATE INDEX idx_api_keys_workspace ON api_keys(workspace_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_status ON api_keys(status);
CREATE INDEX idx_api_keys_created_at ON api_keys(created_at DESC);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);

-- ============================================
-- BASIC TRIGGERS
-- ============================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables
CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bots_updated_at BEFORE UPDATE ON bots FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversation_contexts_updated_at BEFORE UPDATE ON conversation_contexts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_dlq_updated_at BEFORE UPDATE ON dead_letter_queue FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-increment flow version
CREATE OR REPLACE FUNCTION auto_increment_flow_version()
RETURNS TRIGGER AS $$
BEGIN
    SELECT COALESCE(MAX(version), 0) + 1 INTO NEW.version
    FROM flow_versions
    WHERE bot_id = NEW.bot_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_increment_flow_version_trigger
BEFORE INSERT ON flow_versions
FOR EACH ROW
WHEN (NEW.version IS NULL)
EXECUTE FUNCTION auto_increment_flow_version();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE api_keys IS 'API keys for workspace authentication and authorization';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 hash of the API key (never store plain keys)';
COMMENT ON COLUMN api_keys.key_prefix IS 'First 20 characters for display purposes';
COMMENT ON COLUMN api_keys.scopes IS 'Array of permissions: ["read", "write", "admin"]';
COMMENT ON COLUMN api_keys.rate_limit_per_minute IS 'Custom rate limit for this specific key';
