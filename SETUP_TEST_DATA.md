# 🧪 Guide de Setup - Données de Test

## 📋 Vue d'ensemble

Ce script crée automatiquement:
- ✅ Table `public.users` synchronisée avec `auth.users`
- ✅ Utilisateur de test avec credentials
- ✅ Workspace de test
- ✅ API Key de test
- ✅ Fonctions utilitaires pour gérer les données de test

---

## 🚀 Installation Rapide (1 minute)

### Étape 1: Appliquer le script dans Supabase

1. Ouvrez votre **Supabase Dashboard**
2. Allez dans **SQL Editor**
3. Copiez et exécutez le contenu de: `supabase/migrations/setup_users_and_test_data.sql`

### Étape 2: Créer l'environnement de test complet

Dans le **SQL Editor**, exécutez:

```sql
SELECT * FROM setup_complete_test_environment();
```

**Résultat:**
```
┌────────────────────┬────────────┬──────────────────────────────────┐
│ step               │ status     │ details                          │
├────────────────────┼────────────┼──────────────────────────────────┤
│ 1. Create User     │ success    │ {"email": "test@example.com"...} │
│ 2. Create Workspace│ success    │ {"workspace_id": "uuid"...}      │
│ 3. Create API Key  │ success    │ {"api_key": "sk_test_..."...}    │
│ 4. Summary         │ completed  │ {"api_key": "sk_test_..."...}    │
└────────────────────┴────────────┴──────────────────────────────────┘
```

### Étape 3: Sauvegarder vos credentials

**IMPORTANT:** Copiez les valeurs du step 4 (Summary):

```bash
# Dans votre terminal
export API_KEY="sk_test_abc123def456..."
export WORKSPACE_ID="550e8400-e29b-41d4-a716-446655440000"

# Sauvegarder dans .env.test (optionnel)
echo "API_KEY=$API_KEY" >> .env.test
echo "WORKSPACE_ID=$WORKSPACE_ID" >> .env.test
```

---

## 🎯 Utilisation

### ✅ Vous êtes prêt pour les tests!

```bash
# Tester la bulk verification
./scripts/test-bulk-verification.sh

# Ou avec les variables
./scripts/test-bulk-verification.sh \
  -k "$API_KEY" \
  -w "$WORKSPACE_ID" \
  -n 5
```

### 🔑 Credentials créés

| Élément | Valeur |
|---------|--------|
| **Email** | test@example.com |
| **Password** | TestPassword123! |
| **Workspace** | Test Workspace |
| **API Key** | sk_test_... (voir résultat) |

---

## 📚 Fonctions Disponibles

### 1. Créer un utilisateur de test

```sql
-- Créer un utilisateur custom
SELECT * FROM create_test_user(
    'john@example.com',
    'MyPassword123!',
    'John Doe'
);
```

**Paramètres:**
- `user_email` (défaut: test@example.com)
- `user_password` (défaut: TestPassword123!)
- `user_full_name` (défaut: Test User)

### 2. Créer un workspace de test

```sql
-- Créer un workspace pour un user existant
SELECT * FROM create_test_workspace(
    'test@example.com',           -- Email du owner
    'My Test Workspace',          -- Nom du workspace
    'your_phone_number_id',       -- WhatsApp Phone Number ID (optionnel)
    'your_whatsapp_token'         -- WhatsApp Access Token (optionnel)
);
```

### 3. Créer une API Key de test

```sql
-- Créer une API key pour un workspace
SELECT * FROM create_test_api_key(
    'workspace-uuid-here',
    'Production Key',
    'live'  -- ou 'test'
);
```

### 4. Lister toutes les données de test

```sql
SELECT * FROM list_test_data();
```

**Résultat:**
```
user_email          | workspace_name   | api_key_prefix
--------------------|------------------|-------------------
test@example.com    | Test Workspace   | sk_test_abc123...
john@example.com    | John's Workspace | sk_live_xyz789...
```

### 5. Nettoyer toutes les données de test

```sql
SELECT * FROM cleanup_test_data();
```

**⚠️ ATTENTION:** Ceci supprime TOUS les users/workspaces/API keys de test!

---

## 🔧 Configuration Avancée

### Créer plusieurs workspaces pour un user

```sql
-- 1. Créer le user
SELECT * FROM create_test_user('multi@example.com', 'Pass123!', 'Multi User');

-- 2. Créer plusieurs workspaces
SELECT * FROM create_test_workspace('multi@example.com', 'Workspace 1');
SELECT * FROM create_test_workspace('multi@example.com', 'Workspace 2');
SELECT * FROM create_test_workspace('multi@example.com', 'Workspace 3');

-- 3. Créer des API keys pour chaque workspace
SELECT * FROM create_test_api_key(
    (SELECT id FROM workspaces WHERE name = 'Workspace 1'),
    'Dev Key',
    'test'
);
SELECT * FROM create_test_api_key(
    (SELECT id FROM workspaces WHERE name = 'Workspace 2'),
    'Prod Key',
    'live'
);
```

### Ajouter WhatsApp à un workspace existant

```sql
-- Mettre à jour avec vos credentials WhatsApp
UPDATE workspaces
SET
    whatsapp_phone_number_id = 'YOUR_PHONE_NUMBER_ID',
    whatsapp_access_token = 'YOUR_ACCESS_TOKEN'
WHERE name = 'Test Workspace';
```

---

## 🔍 Vérifications

### Vérifier que la table users est créée

```sql
SELECT * FROM public.users;
```

### Vérifier la synchronisation auth.users <-> public.users

```sql
-- Compter les users
SELECT
    (SELECT COUNT(*) FROM auth.users) as auth_users,
    (SELECT COUNT(*) FROM public.users) as public_users;
```

Les deux chiffres doivent être identiques!

### Vérifier les workspaces créés

```sql
SELECT
    w.id,
    w.name,
    w.status,
    u.email as owner_email,
    COUNT(wm.id) as member_count
FROM workspaces w
JOIN public.users u ON u.id = w.owner_id
LEFT JOIN workspace_members wm ON wm.workspace_id = w.id
GROUP BY w.id, w.name, w.status, u.email
ORDER BY w.created_at DESC;
```

### Vérifier les API keys

```sql
SELECT
    ak.id,
    ak.name,
    ak.key_prefix,
    ak.status,
    ak.scopes,
    w.name as workspace_name
FROM api_keys ak
JOIN workspaces w ON w.id = ak.workspace_id
ORDER BY ak.created_at DESC;
```

---

## 🧪 Tests après Setup

### 1. Tester l'authentification

```bash
curl http://localhost:3000/api/workspaces \
  -H "X-API-KEY: $API_KEY"
```

### 2. Tester la création d'un contact

```bash
curl -X POST http://localhost:3000/api/contacts \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: $API_KEY" \
  -d '{
    "workspace_id": "'$WORKSPACE_ID'",
    "phone": "+33612345678",
    "name": "Test Contact"
  }'
```

### 3. Tester la bulk verification

```bash
./scripts/test-bulk-verification.sh -n 3
```

---

## 🔄 Workflow de Développement

### Setup initial (une seule fois)

```sql
-- Exécuter le script complet
SELECT * FROM setup_complete_test_environment();
```

### Entre les tests (reset rapide)

```sql
-- Nettoyer les données
SELECT * FROM cleanup_test_data();

-- Re-créer l'environnement
SELECT * FROM setup_complete_test_environment();
```

### Pour les tests automatisés

```bash
# Script de reset complet
cat > scripts/reset-test-env.sh << 'EOF'
#!/bin/bash
psql $DATABASE_URL << SQL
SELECT * FROM cleanup_test_data();
SELECT * FROM setup_complete_test_environment();
SQL
EOF

chmod +x scripts/reset-test-env.sh
./scripts/reset-test-env.sh
```

---

## 🛡️ Sécurité

### Row Level Security (RLS)

La table `public.users` a RLS activé:

- ✅ Users peuvent voir leur propre profil
- ✅ Users peuvent mettre à jour leur propre profil
- ✅ Workspace members peuvent voir les autres members du workspace
- ❌ Users ne peuvent PAS voir des users hors de leurs workspaces

### Triggers de Synchronisation

- `on_auth_user_created`: Crée automatiquement une entrée dans `public.users`
- `on_auth_user_updated`: Synchronise les updates d'email et metadata

---

## 📊 Schéma de la Table Users

```sql
CREATE TABLE public.users (
    id UUID PRIMARY KEY,              -- Référence auth.users(id)
    email VARCHAR(255) NOT NULL,      -- Synchronisé avec auth.users
    full_name VARCHAR(255),           -- De raw_user_meta_data
    avatar_url TEXT,                  -- De raw_user_meta_data
    phone VARCHAR(20),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    last_sign_in_at TIMESTAMPTZ
);
```

---

## 🐛 Dépannage

### Erreur: "User already exists"

```sql
-- Lister les users existants
SELECT email, id FROM auth.users WHERE email LIKE '%test%';

-- Supprimer un user spécifique
DELETE FROM auth.users WHERE email = 'test@example.com';
```

### Erreur: "Workspace already exists"

```sql
-- Supprimer un workspace spécifique
DELETE FROM workspaces WHERE name = 'Test Workspace';
```

### Reset complet de la base de données

```sql
-- ⚠️ ATTENTION: Supprime TOUT
SELECT * FROM cleanup_test_data();
```

---

## ✅ Checklist Post-Installation

- [ ] Script SQL exécuté sans erreurs
- [ ] `setup_complete_test_environment()` a retourné 4 steps
- [ ] API Key sauvegardée dans variables d'environnement
- [ ] Test d'authentification réussi
- [ ] Bulk verification testée
- [ ] Données visibles dans Supabase Dashboard

---

## 🎉 Vous êtes prêt!

Votre environnement de test est configuré. Lancez vos tests:

```bash
export API_KEY="votre-clé-du-step-4"
export WORKSPACE_ID="votre-workspace-id"
./scripts/test-bulk-verification.sh -n 5
```

Pour plus d'infos sur les tests: consultez **TESTING_GUIDE.md**
