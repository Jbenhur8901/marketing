-- =============================================
-- USERS TABLE & TEST DATA SETUP
-- Crée la table users, sync avec auth.users, et données de test
-- =============================================

-- ============================================
-- 1. TABLE USERS DANS PUBLIC SCHEMA
-- ============================================

CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255),
    avatar_url TEXT,
    phone VARCHAR(20),

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_sign_in_at TIMESTAMP WITH TIME ZONE
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON public.users(created_at DESC);

-- Trigger pour updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. SYNCHRONISATION AVEC AUTH.USERS
-- ============================================

-- Fonction pour créer un user public quand auth.user est créé
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger sur auth.users pour auto-créer dans public.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Fonction pour sync les updates
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.users
    SET
        email = NEW.email,
        full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', full_name),
        avatar_url = COALESCE(NEW.raw_user_meta_data->>'avatar_url', avatar_url),
        last_sign_in_at = NEW.last_sign_in_at,
        updated_at = NOW()
    WHERE id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger pour sync les updates
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
    AFTER UPDATE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_user_update();

-- ============================================
-- 3. ROW LEVEL SECURITY POUR USERS
-- ============================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Les users peuvent voir leur propre profil
CREATE POLICY "Users can view own profile"
    ON public.users FOR SELECT
    USING (auth.uid() = id);

-- Les users peuvent update leur propre profil
CREATE POLICY "Users can update own profile"
    ON public.users FOR UPDATE
    USING (auth.uid() = id);

-- Les workspace members peuvent voir les autres users du workspace
CREATE POLICY "Workspace members can view other members"
    ON public.users FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM workspace_members wm1
            JOIN workspace_members wm2 ON wm1.workspace_id = wm2.workspace_id
            WHERE wm1.user_id = auth.uid()
            AND wm2.user_id = users.id
        )
    );

-- ============================================
-- 4. CRÉER UTILISATEUR DE TEST
-- ============================================

-- Fonction pour créer un utilisateur de test
CREATE OR REPLACE FUNCTION create_test_user(
    user_email TEXT DEFAULT 'test@example.com',
    user_password TEXT DEFAULT 'TestPassword123!',
    user_full_name TEXT DEFAULT 'Test User'
)
RETURNS TABLE(
    user_id UUID,
    email TEXT,
    message TEXT
) AS $$
DECLARE
    v_user_id UUID;
    v_encrypted_password TEXT;
BEGIN
    -- Vérifier si l'utilisateur existe déjà
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE auth.users.email = user_email;

    IF v_user_id IS NOT NULL THEN
        -- L'utilisateur existe déjà
        RETURN QUERY SELECT
            v_user_id,
            user_email,
            'User already exists'::TEXT;
        RETURN;
    END IF;

    -- Créer un UUID pour le nouvel utilisateur
    v_user_id := gen_random_uuid();

    -- Hash le mot de passe (utilise crypt de pgcrypto)
    v_encrypted_password := crypt(user_password, gen_salt('bf'));

    -- Insérer dans auth.users
    INSERT INTO auth.users (
        id,
        instance_id,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token,
        aud,
        role
    ) VALUES (
        v_user_id,
        '00000000-0000-0000-0000-000000000000',
        user_email,
        v_encrypted_password,
        NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', user_full_name),
        NOW(),
        NOW(),
        '',
        '',
        '',
        '',
        'authenticated',
        'authenticated'
    );

    -- Le trigger handle_new_user() va créer automatiquement l'entrée dans public.users

    RETURN QUERY SELECT
        v_user_id,
        user_email,
        'User created successfully'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. CRÉER WORKSPACE DE TEST
-- ============================================

CREATE OR REPLACE FUNCTION create_test_workspace(
    owner_email TEXT DEFAULT 'test@example.com',
    workspace_name TEXT DEFAULT 'Test Workspace',
    whatsapp_phone_id TEXT DEFAULT NULL,
    whatsapp_token TEXT DEFAULT NULL
)
RETURNS TABLE(
    workspace_id UUID,
    name TEXT,
    owner_id UUID,
    message TEXT
) AS $$
DECLARE
    v_user_id UUID;
    v_workspace_id UUID;
    v_member_id UUID;
BEGIN
    -- Récupérer l'ID de l'utilisateur
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = owner_email;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User with email % not found', owner_email;
    END IF;

    -- Créer le workspace
    INSERT INTO workspaces (
        name,
        owner_id,
        whatsapp_phone_number_id,
        whatsapp_access_token,
        status
    ) VALUES (
        workspace_name,
        v_user_id,
        whatsapp_phone_id,
        whatsapp_token,
        'active'
    )
    RETURNING id INTO v_workspace_id;

    -- Ajouter l'owner comme admin du workspace
    INSERT INTO workspace_members (
        workspace_id,
        user_id,
        role,
        joined_at
    ) VALUES (
        v_workspace_id,
        v_user_id,
        'admin',
        NOW()
    );

    RETURN QUERY SELECT
        v_workspace_id,
        workspace_name,
        v_user_id,
        'Workspace created successfully'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. CRÉER API KEY DE TEST
-- ============================================

CREATE OR REPLACE FUNCTION create_test_api_key(
    p_workspace_id UUID,
    key_name TEXT DEFAULT 'Test API Key',
    key_type TEXT DEFAULT 'test'
)
RETURNS TABLE(
    api_key TEXT,
    key_id UUID,
    key_prefix TEXT,
    message TEXT
) AS $$
DECLARE
    v_api_key TEXT;
    v_key_hash TEXT;
    v_key_prefix TEXT;
    v_key_id UUID;
BEGIN
    -- Générer la clé API
    v_api_key := generate_api_key(key_type);

    -- Hasher la clé
    v_key_hash := hash_api_key(v_api_key);

    -- Obtenir le préfixe (seulement les 20 premiers caractères)
    v_key_prefix := substring(v_api_key from 1 for 20);

    -- Insérer la clé
    INSERT INTO api_keys (
        workspace_id,
        name,
        key_hash,
        key_prefix,
        scopes,
        rate_limit_per_minute,
        status
    ) VALUES (
        p_workspace_id,
        key_name,
        v_key_hash,
        v_key_prefix,
        '["read", "write"]'::jsonb,
        100,
        'active'
    )
    RETURNING id INTO v_key_id;

    RETURN QUERY SELECT
        v_api_key,
        v_key_id,
        v_key_prefix,
        'API key created successfully'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. SCRIPT TOUT-EN-UN POUR SETUP COMPLET
-- ============================================

CREATE OR REPLACE FUNCTION setup_complete_test_environment()
RETURNS TABLE(
    step TEXT,
    status TEXT,
    details JSONB
) AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT := 'test@example.com';
    v_workspace_id UUID;
    v_workspace_name TEXT;
    v_api_key TEXT;
    v_key_id UUID;
    v_message TEXT;
BEGIN
    -- Étape 1: Créer l'utilisateur
    SELECT
        u.user_id,
        u.message
    INTO v_user_id, v_message
    FROM create_test_user('test@example.com', 'TestPassword123!', 'Test User') u;

    RETURN QUERY
    SELECT
        '1. Create User'::TEXT,
        'success'::TEXT,
        jsonb_build_object(
            'email', v_user_email,
            'user_id', v_user_id,
            'message', v_message
        );

    -- Étape 2: Créer le workspace
    SELECT
        w.workspace_id,
        w.name
    INTO v_workspace_id, v_workspace_name
    FROM create_test_workspace(v_user_email, 'Test Workspace', NULL, NULL) w;

    RETURN QUERY
    SELECT
        '2. Create Workspace'::TEXT,
        'success'::TEXT,
        jsonb_build_object(
            'workspace_id', v_workspace_id,
            'name', v_workspace_name,
            'owner_id', v_user_id
        );

    -- Étape 3: Créer l'API Key
    SELECT
        k.api_key,
        k.key_id
    INTO v_api_key, v_key_id
    FROM create_test_api_key(v_workspace_id, 'Test API Key', 'test') k;

    RETURN QUERY
    SELECT
        '3. Create API Key'::TEXT,
        'success'::TEXT,
        jsonb_build_object(
            'api_key', v_api_key,
            'key_id', v_key_id,
            'workspace_id', v_workspace_id,
            'IMPORTANT', 'Save this API key - it will not be shown again!'
        );

    -- Étape 4: Résumé
    RETURN QUERY
    SELECT
        '4. Summary'::TEXT,
        'completed'::TEXT,
        jsonb_build_object(
            'user_email', v_user_email,
            'user_password', 'TestPassword123!',
            'workspace_id', v_workspace_id,
            'api_key', v_api_key,
            'api_url', 'http://localhost:3000',
            'next_steps', ARRAY[
                'Export API_KEY=' || v_api_key,
                'Export WORKSPACE_ID=' || v_workspace_id::TEXT,
                'Run: ./scripts/test-bulk-verification.sh'
            ]
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. FONCTIONS UTILITAIRES
-- ============================================

-- Fonction pour lister tous les test users et workspaces
CREATE OR REPLACE FUNCTION list_test_data()
RETURNS TABLE(
    user_email TEXT,
    user_id UUID,
    workspace_name TEXT,
    workspace_id UUID,
    api_key_prefix TEXT,
    api_key_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.email,
        u.id,
        w.name,
        w.id,
        ak.key_prefix,
        ak.name
    FROM auth.users u
    LEFT JOIN workspaces w ON w.owner_id = u.id
    LEFT JOIN api_keys ak ON ak.workspace_id = w.id
    WHERE u.email LIKE '%test%' OR u.email LIKE '%example%'
    ORDER BY u.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour nettoyer les données de test
CREATE OR REPLACE FUNCTION cleanup_test_data()
RETURNS TABLE(
    action TEXT,
    count INTEGER
) AS $$
DECLARE
    deleted_users INTEGER;
    deleted_workspaces INTEGER;
    deleted_api_keys INTEGER;
BEGIN
    -- Supprimer les API keys de test
    DELETE FROM api_keys
    WHERE workspace_id IN (
        SELECT id FROM workspaces
        WHERE owner_id IN (
            SELECT id FROM auth.users
            WHERE email LIKE '%test%' OR email LIKE '%example%'
        )
    );
    GET DIAGNOSTICS deleted_api_keys = ROW_COUNT;

    -- Supprimer les workspaces de test
    DELETE FROM workspaces
    WHERE owner_id IN (
        SELECT id FROM auth.users
        WHERE email LIKE '%test%' OR email LIKE '%example%'
    );
    GET DIAGNOSTICS deleted_workspaces = ROW_COUNT;

    -- Supprimer les users de test (cascade supprimera public.users)
    DELETE FROM auth.users
    WHERE email LIKE '%test%' OR email LIKE '%example%';
    GET DIAGNOSTICS deleted_users = ROW_COUNT;

    RETURN QUERY SELECT 'Deleted API Keys'::TEXT, deleted_api_keys;
    RETURN QUERY SELECT 'Deleted Workspaces'::TEXT, deleted_workspaces;
    RETURN QUERY SELECT 'Deleted Users'::TEXT, deleted_users;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- COMMENTAIRES
-- ============================================

COMMENT ON TABLE public.users IS 'Table utilisateurs synchronisée avec auth.users';
COMMENT ON FUNCTION handle_new_user() IS 'Trigger function pour créer public.users quand auth.user est créé';
COMMENT ON FUNCTION create_test_user(TEXT, TEXT, TEXT) IS 'Créer un utilisateur de test avec email et mot de passe';
COMMENT ON FUNCTION create_test_workspace(TEXT, TEXT, TEXT, TEXT) IS 'Créer un workspace de test pour un utilisateur';
COMMENT ON FUNCTION create_test_api_key(UUID, TEXT, TEXT) IS 'Créer une API key de test pour un workspace';
COMMENT ON FUNCTION setup_complete_test_environment() IS 'Setup complet: user + workspace + API key';
COMMENT ON FUNCTION list_test_data() IS 'Lister toutes les données de test';
COMMENT ON FUNCTION cleanup_test_data() IS 'Nettoyer toutes les données de test';
