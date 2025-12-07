-- =============================================
-- ROW LEVEL SECURITY POLICIES
-- WhatsApp Chatbot Platform
-- =============================================

-- ============================================
-- ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_verification_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE number_verification_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE dead_letter_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- ============================================
-- HELPER FUNCTIONS FOR RLS
-- ============================================

-- Check if user is workspace member
CREATE OR REPLACE FUNCTION is_workspace_member(workspace_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM workspace_members
        WHERE workspace_id = workspace_uuid
        AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user workspace role
CREATE OR REPLACE FUNCTION get_workspace_role(workspace_uuid UUID)
RETURNS TEXT AS $$
BEGIN
    RETURN (
        SELECT role FROM workspace_members
        WHERE workspace_id = workspace_uuid
        AND user_id = auth.uid()
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user can write to workspace
CREATE OR REPLACE FUNCTION can_write_workspace(workspace_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    user_role := get_workspace_role(workspace_uuid);
    RETURN user_role IN ('admin', 'member');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is admin
CREATE OR REPLACE FUNCTION is_workspace_admin(workspace_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN get_workspace_role(workspace_uuid) = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- WORKSPACES POLICIES
-- ============================================

CREATE POLICY "Users can view their workspaces"
    ON workspaces FOR SELECT
    USING (is_workspace_member(id));

CREATE POLICY "Users can create workspaces"
    ON workspaces FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Admins can update their workspaces"
    ON workspaces FOR UPDATE
    USING (is_workspace_admin(id));

CREATE POLICY "Owners can delete their workspaces"
    ON workspaces FOR DELETE
    USING (auth.uid() = owner_id);

-- ============================================
-- WORKSPACE MEMBERS POLICIES
-- ============================================

CREATE POLICY "Users can view workspace members"
    ON workspace_members FOR SELECT
    USING (is_workspace_member(workspace_id));

CREATE POLICY "Admins can add workspace members"
    ON workspace_members FOR INSERT
    WITH CHECK (is_workspace_admin(workspace_id));

CREATE POLICY "Admins can update workspace members"
    ON workspace_members FOR UPDATE
    USING (is_workspace_admin(workspace_id));

CREATE POLICY "Admins can remove workspace members"
    ON workspace_members FOR DELETE
    USING (is_workspace_admin(workspace_id));

-- ============================================
-- BOTS POLICIES
-- ============================================

CREATE POLICY "Users can view workspace bots"
    ON bots FOR SELECT
    USING (is_workspace_member(workspace_id));

CREATE POLICY "Members can create bots"
    ON bots FOR INSERT
    WITH CHECK (can_write_workspace(workspace_id));

CREATE POLICY "Members can update bots"
    ON bots FOR UPDATE
    USING (can_write_workspace(workspace_id));

CREATE POLICY "Admins can delete bots"
    ON bots FOR DELETE
    USING (is_workspace_admin(workspace_id));

-- ============================================
-- FLOW VERSIONS POLICIES
-- ============================================

CREATE POLICY "Users can view flow versions"
    ON flow_versions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bots
            WHERE bots.id = flow_versions.bot_id
            AND is_workspace_member(bots.workspace_id)
        )
    );

CREATE POLICY "Members can create flow versions"
    ON flow_versions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM bots
            WHERE bots.id = flow_versions.bot_id
            AND can_write_workspace(bots.workspace_id)
        )
    );

-- ============================================
-- CONTACTS POLICIES
-- ============================================

CREATE POLICY "Users can view workspace contacts"
    ON contacts FOR SELECT
    USING (is_workspace_member(workspace_id));

CREATE POLICY "Members can create contacts"
    ON contacts FOR INSERT
    WITH CHECK (can_write_workspace(workspace_id));

CREATE POLICY "Members can update contacts"
    ON contacts FOR UPDATE
    USING (can_write_workspace(workspace_id));

CREATE POLICY "Admins can delete contacts"
    ON contacts FOR DELETE
    USING (is_workspace_admin(workspace_id));

-- ============================================
-- CONVERSATIONS POLICIES
-- ============================================

CREATE POLICY "Users can view workspace conversations"
    ON conversations FOR SELECT
    USING (is_workspace_member(workspace_id));

CREATE POLICY "System can create conversations"
    ON conversations FOR INSERT
    WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "Members can update conversations"
    ON conversations FOR UPDATE
    USING (can_write_workspace(workspace_id));

CREATE POLICY "Admins can delete conversations"
    ON conversations FOR DELETE
    USING (is_workspace_admin(workspace_id));

-- ============================================
-- MESSAGES POLICIES
-- ============================================

CREATE POLICY "Users can view conversation messages"
    ON messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = messages.conversation_id
            AND is_workspace_member(conversations.workspace_id)
        )
    );

CREATE POLICY "System can create messages"
    ON messages FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = messages.conversation_id
            AND is_workspace_member(conversations.workspace_id)
        )
    );

CREATE POLICY "System can update message status"
    ON messages FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = messages.conversation_id
            AND is_workspace_member(conversations.workspace_id)
        )
    );

-- ============================================
-- CONVERSATION CONTEXTS POLICIES
-- ============================================

CREATE POLICY "Users can view conversation contexts"
    ON conversation_contexts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = conversation_contexts.conversation_id
            AND is_workspace_member(conversations.workspace_id)
        )
    );

CREATE POLICY "System can manage conversation contexts"
    ON conversation_contexts FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = conversation_contexts.conversation_id
            AND is_workspace_member(conversations.workspace_id)
        )
    );

-- ============================================
-- BULK VERIFICATION POLICIES
-- ============================================

CREATE POLICY "Users can view workspace verification jobs"
    ON bulk_verification_jobs FOR SELECT
    USING (is_workspace_member(workspace_id));

CREATE POLICY "Members can create verification jobs"
    ON bulk_verification_jobs FOR INSERT
    WITH CHECK (can_write_workspace(workspace_id));

CREATE POLICY "Users can update their verification jobs"
    ON bulk_verification_jobs FOR UPDATE
    USING (is_workspace_member(workspace_id));

CREATE POLICY "Users can delete their verification jobs"
    ON bulk_verification_jobs FOR DELETE
    USING (is_workspace_member(workspace_id));

-- Verification Results
CREATE POLICY "Users can view verification results"
    ON number_verification_results FOR SELECT
    USING (is_workspace_member(workspace_id));

CREATE POLICY "System can manage verification results"
    ON number_verification_results FOR ALL
    USING (is_workspace_member(workspace_id));

-- ============================================
-- BROADCASTING POLICIES
-- ============================================

CREATE POLICY "Users can view workspace templates"
    ON broadcast_templates FOR SELECT
    USING (is_workspace_member(workspace_id));

CREATE POLICY "Members can create templates"
    ON broadcast_templates FOR INSERT
    WITH CHECK (can_write_workspace(workspace_id));

CREATE POLICY "Members can update templates"
    ON broadcast_templates FOR UPDATE
    USING (can_write_workspace(workspace_id));

CREATE POLICY "Admins can delete templates"
    ON broadcast_templates FOR DELETE
    USING (is_workspace_admin(workspace_id));

-- Campaigns
CREATE POLICY "Users can view workspace campaigns"
    ON broadcast_campaigns FOR SELECT
    USING (is_workspace_member(workspace_id));

CREATE POLICY "Members can create campaigns"
    ON broadcast_campaigns FOR INSERT
    WITH CHECK (can_write_workspace(workspace_id));

CREATE POLICY "Members can update campaigns"
    ON broadcast_campaigns FOR UPDATE
    USING (can_write_workspace(workspace_id));

CREATE POLICY "Admins can delete campaigns"
    ON broadcast_campaigns FOR DELETE
    USING (is_workspace_admin(workspace_id));

-- Campaign Messages
CREATE POLICY "Users can view campaign messages"
    ON broadcast_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM broadcast_campaigns
            WHERE broadcast_campaigns.id = broadcast_messages.campaign_id
            AND is_workspace_member(broadcast_campaigns.workspace_id)
        )
    );

CREATE POLICY "System can manage campaign messages"
    ON broadcast_messages FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM broadcast_campaigns
            WHERE broadcast_campaigns.id = broadcast_messages.campaign_id
            AND is_workspace_member(broadcast_campaigns.workspace_id)
        )
    );

-- ============================================
-- DEAD LETTER QUEUE POLICIES
-- ============================================

CREATE POLICY "Users can view DLQ entries in their workspace"
    ON dead_letter_queue FOR SELECT
    USING (is_workspace_member(workspace_id));

CREATE POLICY "Users can update DLQ entries in their workspace"
    ON dead_letter_queue FOR UPDATE
    USING (can_write_workspace(workspace_id));

CREATE POLICY "System can insert into DLQ"
    ON dead_letter_queue FOR INSERT
    WITH CHECK (true);

-- ============================================
-- API KEYS POLICIES
-- ============================================

CREATE POLICY "Users can view API keys in their workspace"
    ON api_keys FOR SELECT
    USING (is_workspace_member(workspace_id));

CREATE POLICY "Admins can create API keys"
    ON api_keys FOR INSERT
    WITH CHECK (is_workspace_admin(workspace_id));

CREATE POLICY "Admins can update API keys"
    ON api_keys FOR UPDATE
    USING (is_workspace_admin(workspace_id));

CREATE POLICY "Admins can delete API keys"
    ON api_keys FOR DELETE
    USING (is_workspace_admin(workspace_id));
