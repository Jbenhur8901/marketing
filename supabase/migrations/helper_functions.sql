-- =============================================
-- HELPER FUNCTIONS
-- WhatsApp Chatbot Platform
-- =============================================

-- ============================================
-- BROADCAST FUNCTIONS
-- ============================================

-- Function to increment broadcast campaign stats
CREATE OR REPLACE FUNCTION increment_campaign_stat(
    campaign_id UUID,
    field VARCHAR
)
RETURNS VOID AS $$
BEGIN
    CASE field
        WHEN 'delivered_count' THEN
            UPDATE broadcast_campaigns
            SET delivered_count = delivered_count + 1
            WHERE id = campaign_id;
        WHEN 'read_count' THEN
            UPDATE broadcast_campaigns
            SET read_count = read_count + 1
            WHERE id = campaign_id;
        ELSE
            RAISE EXCEPTION 'Invalid field: %', field;
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate broadcast statistics
CREATE OR REPLACE FUNCTION get_broadcast_stats(campaign_uuid UUID)
RETURNS TABLE (
    total_messages INTEGER,
    pending_count INTEGER,
    sent_count INTEGER,
    delivered_count INTEGER,
    read_count INTEGER,
    failed_count INTEGER,
    delivery_rate NUMERIC,
    read_rate NUMERIC
) AS $$
DECLARE
    total INT;
    pending INT;
    sent INT;
    delivered INT;
    read INT;
    failed INT;
BEGIN
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'pending'),
        COUNT(*) FILTER (WHERE status = 'sent'),
        COUNT(*) FILTER (WHERE status = 'delivered'),
        COUNT(*) FILTER (WHERE status = 'read'),
        COUNT(*) FILTER (WHERE status = 'failed')
    INTO total, pending, sent, delivered, read, failed
    FROM broadcast_messages
    WHERE campaign_id = campaign_uuid;

    RETURN QUERY SELECT
        total,
        pending,
        sent,
        delivered,
        read,
        failed,
        CASE WHEN total > 0 THEN ROUND((delivered::NUMERIC / total) * 100, 2) ELSE 0 END,
        CASE WHEN total > 0 THEN ROUND((read::NUMERIC / total) * 100, 2) ELSE 0 END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- WORKSPACE FUNCTIONS
-- ============================================

-- Function to get workspace by phone number ID
CREATE OR REPLACE FUNCTION get_workspace_by_phone_number_id(phone_number_id VARCHAR)
RETURNS TABLE (
    id UUID,
    name VARCHAR,
    whatsapp_phone_number_id VARCHAR,
    whatsapp_access_token TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        w.id,
        w.name,
        w.whatsapp_phone_number_id,
        w.whatsapp_access_token
    FROM workspaces w
    WHERE w.whatsapp_phone_number_id = phone_number_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- BOT FUNCTIONS
-- ============================================

-- Function to get active bot for workspace
CREATE OR REPLACE FUNCTION get_active_bot_for_workspace(workspace_uuid UUID)
RETURNS TABLE (
    id UUID,
    name VARCHAR,
    flow_json JSONB,
    triggers JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        b.id,
        b.name,
        b.flow_json,
        b.triggers
    FROM bots b
    WHERE b.workspace_id = workspace_uuid
    AND b.status = 'active'
    ORDER BY b.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- CONTACT FUNCTIONS
-- ============================================

-- Function to update contact last message timestamp
CREATE OR REPLACE FUNCTION update_contact_last_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE contacts
    SET last_message_at = NEW.timestamp
    WHERE id = (
        SELECT contact_id FROM conversations WHERE id = NEW.conversation_id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update contact last_message_at when message is inserted
CREATE TRIGGER update_contact_last_message_trigger
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION update_contact_last_message();

-- ============================================
-- VERIFICATION FUNCTIONS
-- ============================================

-- Function to clean up old verification cache
CREATE OR REPLACE FUNCTION cleanup_verification_cache()
RETURNS VOID AS $$
BEGIN
    DELETE FROM number_verification_results
    WHERE cache_expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule cleanup job (runs daily at midnight)
SELECT cron.schedule(
    'cleanup-verification-cache',
    '0 0 * * *',
    $$SELECT cleanup_verification_cache()$$
);

-- ============================================
-- DEAD LETTER QUEUE FUNCTIONS
-- ============================================

-- Function to calculate next retry time (exponential backoff)
CREATE OR REPLACE FUNCTION calculate_next_retry(retry_count INT)
RETURNS TIMESTAMP WITH TIME ZONE AS $$
BEGIN
    -- Exponential backoff: 1min, 5min, 30min, 2hours, 12hours, 24hours
    RETURN NOW() + CASE
        WHEN retry_count = 0 THEN INTERVAL '1 minute'
        WHEN retry_count = 1 THEN INTERVAL '5 minutes'
        WHEN retry_count = 2 THEN INTERVAL '30 minutes'
        WHEN retry_count = 3 THEN INTERVAL '2 hours'
        WHEN retry_count = 4 THEN INTERVAL '12 hours'
        ELSE INTERVAL '24 hours'
    END;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- API KEYS FUNCTIONS
-- ============================================

-- Function to generate a secure API key
CREATE OR REPLACE FUNCTION generate_api_key(key_type VARCHAR DEFAULT 'live')
RETURNS TEXT AS $$
DECLARE
    random_part TEXT;
BEGIN
    -- Generate random part (32 bytes = 64 hex chars)
    random_part := encode(gen_random_bytes(32), 'hex');

    -- Return formatted key: sk_live_xxxx or sk_test_xxxx
    RETURN 'sk_' || key_type || '_' || random_part;
END;
$$ LANGUAGE plpgsql;

-- Function to hash API key (using SHA-256)
CREATE OR REPLACE FUNCTION hash_api_key(plain_key TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN encode(digest(plain_key, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Function to get key prefix (first 20 chars for display)
CREATE OR REPLACE FUNCTION get_key_prefix(plain_key TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN substring(plain_key from 1 for 20) || '...';
END;
$$ LANGUAGE plpgsql;

-- Function to validate and get workspace from API key
CREATE OR REPLACE FUNCTION validate_api_key(plain_key TEXT)
RETURNS TABLE(
    workspace_id UUID,
    key_id UUID,
    scopes JSONB,
    rate_limit_per_minute INT,
    is_valid BOOLEAN
) AS $$
DECLARE
    key_hash_value TEXT;
BEGIN
    -- Hash the provided key
    key_hash_value := hash_api_key(plain_key);

    -- Find matching key
    RETURN QUERY
    SELECT
        ak.workspace_id,
        ak.id as key_id,
        ak.scopes,
        ak.rate_limit_per_minute,
        CASE
            WHEN ak.status = 'active'
            AND (ak.expires_at IS NULL OR ak.expires_at > NOW())
            THEN true
            ELSE false
        END as is_valid
    FROM api_keys ak
    WHERE ak.key_hash = key_hash_value
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record API key usage
CREATE OR REPLACE FUNCTION record_api_key_usage(
    plain_key TEXT,
    client_ip INET DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    key_hash_value TEXT;
BEGIN
    key_hash_value := hash_api_key(plain_key);

    UPDATE api_keys
    SET
        last_used_at = NOW(),
        last_used_ip = COALESCE(client_ip, last_used_ip),
        usage_count = usage_count + 1
    WHERE key_hash = key_hash_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to revoke an API key
CREATE OR REPLACE FUNCTION revoke_api_key(
    key_id_param UUID,
    revoked_by_param UUID,
    reason TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE api_keys
    SET
        status = 'revoked',
        revoked_by = revoked_by_param,
        revoked_at = NOW(),
        revoke_reason = reason
    WHERE id = key_id_param;
END;
$$ LANGUAGE plpgsql;
