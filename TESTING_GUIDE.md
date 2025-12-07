# 🧪 Guide de Test - WhatsApp Services & Bulk Verification

## 📋 Prérequis

1. **Serveur démarré**
   ```bash
   npm start
   # Serveur sur http://localhost:3000
   ```

2. **Base de données configurée**
   - Migrations appliquées (schema.sql, rls_policies.sql, helper_functions.sql)
   - Au moins un workspace créé

3. **Configuration WhatsApp**
   - `whatsapp_access_token` configuré dans la table `workspaces`
   - `whatsapp_phone_number_id` configuré

4. **API Key générée**
   - Créer une clé API pour votre workspace (voir API_KEYS_GUIDE.md)

---

## 🔑 1. Préparation - Créer une API Key

### Option A: Créer via SQL (Plus rapide pour les tests)

```sql
-- Dans Supabase SQL Editor
-- Remplacez YOUR_WORKSPACE_ID par votre ID workspace

-- 1. Générer une clé API
SELECT generate_api_key('test') as api_key;
-- Résultat: sk_test_abc123...

-- 2. Insérer la clé dans la table
INSERT INTO api_keys (workspace_id, name, key_hash, key_prefix, scopes, status)
VALUES (
    'YOUR_WORKSPACE_ID',
    'Test Key',
    hash_api_key('sk_test_abc123...'), -- Utilisez la clé générée ci-dessus
    get_key_prefix('sk_test_abc123...'),
    '["read", "write"]'::jsonb,
    'active'
);
```

### Option B: Variables d'environnement (pour tous les tests)

```bash
# Dans votre terminal
export API_KEY="sk_test_abc123..."
export WORKSPACE_ID="your-workspace-uuid"
```

---

## 📱 2. Test Bulk Verification (LE PLUS IMPORTANT)

### 🚀 Démarrer une vérification en masse

```bash
curl -X POST http://localhost:3000/api/bulk-verification/start \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: $API_KEY" \
  -d '{
    "workspace_id": "'$WORKSPACE_ID'",
    "phone_numbers": [
      "+33612345678",
      "+14155552671",
      "+447700900123",
      "+33698765432"
    ],
    "auto_add_to_contacts": false
  }'
```

**Réponse:**
```json
{
  "job": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "workspace_id": "...",
    "status": "pending",
    "total_numbers": 4,
    "processed_count": 0,
    "verified_count": 0,
    "failed_count": 0,
    "auto_add_to_contacts": false,
    "created_at": "2025-12-07T10:00:00Z"
  }
}
```

**💡 Sauvegardez le `job.id` pour les prochaines étapes!**

### 📊 Vérifier le statut du job

```bash
# Remplacez JOB_ID par l'ID reçu ci-dessus
export JOB_ID="550e8400-e29b-41d4-a716-446655440000"

curl http://localhost:3000/api/bulk-verification/$JOB_ID \
  -H "X-API-KEY: $API_KEY"
```

**Réponse:**
```json
{
  "job": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "processing",
    "total_numbers": 4,
    "processed_count": 2,
    "verified_count": 1,
    "failed_count": 1,
    "percentage": 50,
    "created_at": "2025-12-07T10:00:00Z"
  }
}
```

**Status possibles:**
- `pending` - En attente de traitement
- `processing` - En cours de vérification
- `completed` - Terminé avec succès
- `failed` - Échoué
- `cancelled` - Annulé

### 📋 Récupérer les résultats détaillés

```bash
# Tous les résultats
curl "http://localhost:3000/api/bulk-verification/$JOB_ID/results" \
  -H "X-API-KEY: $API_KEY"

# Seulement les numéros valides WhatsApp
curl "http://localhost:3000/api/bulk-verification/$JOB_ID/results?whatsapp_exists=true" \
  -H "X-API-KEY: $API_KEY"

# Avec pagination
curl "http://localhost:3000/api/bulk-verification/$JOB_ID/results?page=1&limit=10" \
  -H "X-API-KEY: $API_KEY"
```

**Réponse:**
```json
{
  "results": [
    {
      "id": "...",
      "job_id": "550e8400-e29b-41d4-a716-446655440000",
      "phone": "+33612345678",
      "format_valid": true,
      "whatsapp_exists": true,
      "wa_id": "33612345678",
      "status": "verified",
      "verified_at": "2025-12-07T10:01:00Z"
    },
    {
      "id": "...",
      "phone": "+14155552671",
      "format_valid": true,
      "whatsapp_exists": false,
      "wa_id": null,
      "status": "failed",
      "error_message": "Number not on WhatsApp",
      "verified_at": "2025-12-07T10:01:30Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 4,
    "pages": 1
  }
}
```

### 📥 Exporter les résultats en CSV

```bash
curl -X POST "http://localhost:3000/api/bulk-verification/$JOB_ID/export" \
  -H "X-API-KEY: $API_KEY" \
  -o verification-results.csv

# Voir le fichier
cat verification-results.csv
```

**Contenu CSV:**
```csv
phone,format_valid,whatsapp_exists,wa_id,status,error_message,verified_at
+33612345678,true,true,33612345678,verified,,2025-12-07T10:01:00Z
+14155552671,true,false,,failed,Number not on WhatsApp,2025-12-07T10:01:30Z
```

### 📜 Lister tous les jobs

```bash
curl "http://localhost:3000/api/bulk-verification?workspace_id=$WORKSPACE_ID" \
  -H "X-API-KEY: $API_KEY"
```

### ❌ Annuler un job

```bash
curl -X DELETE "http://localhost:3000/api/bulk-verification/$JOB_ID" \
  -H "X-API-KEY: $API_KEY"
```

---

## 💬 3. Test Envoi de Messages WhatsApp

### Créer un workspace avec WhatsApp configuré

```sql
-- Dans Supabase SQL Editor
INSERT INTO workspaces (name, owner_id, whatsapp_phone_number_id, whatsapp_access_token)
VALUES (
    'Test Workspace',
    (SELECT id FROM auth.users LIMIT 1),
    'YOUR_PHONE_NUMBER_ID',
    'YOUR_ACCESS_TOKEN'
);
```

### Test d'envoi via le service (dans votre code)

```javascript
import { WhatsAppService } from './services/whatsapp.service.js';

// Créer le service
const whatsapp = new WhatsAppService(
  'YOUR_PHONE_NUMBER_ID',
  'YOUR_ACCESS_TOKEN'
);

// Envoyer un message texte
try {
  const result = await whatsapp.sendText('+33612345678', 'Hello from WhatsApp!');
  console.log('Message envoyé:', result);
} catch (error) {
  console.error('Erreur:', error.message);
}
```

### Test via endpoint API (si vous avez créé une route)

```bash
# Exemple d'envoi de message
curl -X POST http://localhost:3000/api/messages/send \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: $API_KEY" \
  -d '{
    "workspace_id": "'$WORKSPACE_ID'",
    "to": "+33612345678",
    "type": "text",
    "content": "Bonjour depuis l API!"
  }'
```

---

## 🧪 4. Tests Unitaires Automatisés

### Lancer tous les tests

```bash
npm test
```

### Lancer les tests avec coverage

```bash
npm test -- --coverage
```

### Lancer un fichier de test spécifique

```bash
npm test -- src/__tests__/utils/validation.test.js
```

---

## 🔍 5. Surveillance et Debugging

### Voir les logs en temps réel

```bash
# Les logs sont dans logs/
tail -f logs/app.log
tail -f logs/error.log
```

### Vérifier l'état de l'API

```bash
# Health check
curl http://localhost:3000/

# Monitoring endpoint
curl http://localhost:3000/api/monitoring/health \
  -H "X-API-KEY: $API_KEY"
```

### Vérifier les jobs en cours dans la DB

```sql
-- Dans Supabase SQL Editor
SELECT
  id,
  status,
  total_numbers,
  processed_count,
  verified_count,
  failed_count,
  ROUND((processed_count::numeric / total_numbers) * 100, 2) as percentage,
  created_at
FROM bulk_verification_jobs
ORDER BY created_at DESC
LIMIT 10;
```

---

## ⚡ 6. Test de Performance Bulk Verification

### Petit test (10 numéros)

```bash
curl -X POST http://localhost:3000/api/bulk-verification/start \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: $API_KEY" \
  -d '{
    "workspace_id": "'$WORKSPACE_ID'",
    "phone_numbers": [
      "+33612345671",
      "+33612345672",
      "+33612345673",
      "+33612345674",
      "+33612345675",
      "+33612345676",
      "+33612345677",
      "+33612345678",
      "+33612345679",
      "+33612345680"
    ],
    "auto_add_to_contacts": true
  }'
```

### Test moyen (100 numéros)

Créez un fichier `numbers.json`:

```json
{
  "workspace_id": "YOUR_WORKSPACE_ID",
  "phone_numbers": [
    "+33612345601",
    "+33612345602",
    ...
    "+33612345700"
  ],
  "auto_add_to_contacts": false
}
```

```bash
curl -X POST http://localhost:3000/api/bulk-verification/start \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: $API_KEY" \
  -d @numbers.json
```

### Surveiller la progression

```bash
# Script de monitoring (polling toutes les 5 secondes)
watch -n 5 "curl -s http://localhost:3000/api/bulk-verification/$JOB_ID \
  -H 'X-API-KEY: $API_KEY' | jq '.job | {status, percentage, verified_count, failed_count}'"
```

---

## 🎯 7. Scénarios de Test Complets

### Scénario 1: Vérification avec auto-ajout aux contacts

```bash
# 1. Démarrer la vérification
RESPONSE=$(curl -s -X POST http://localhost:3000/api/bulk-verification/start \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: $API_KEY" \
  -d '{
    "workspace_id": "'$WORKSPACE_ID'",
    "phone_numbers": ["+33612345678", "+14155552671"],
    "auto_add_to_contacts": true
  }')

# 2. Extraire le job ID
JOB_ID=$(echo $RESPONSE | jq -r '.job.id')
echo "Job ID: $JOB_ID"

# 3. Attendre la fin
sleep 10

# 4. Vérifier les résultats
curl "http://localhost:3000/api/bulk-verification/$JOB_ID/results" \
  -H "X-API-KEY: $API_KEY" | jq

# 5. Vérifier que les contacts ont été ajoutés
curl "http://localhost:3000/api/contacts?workspace_id=$WORKSPACE_ID" \
  -H "X-API-KEY: $API_KEY" | jq
```

### Scénario 2: Export et analyse

```bash
# 1. Vérifier des numéros
# 2. Exporter en CSV
# 3. Analyser avec des outils

curl -X POST "http://localhost:3000/api/bulk-verification/$JOB_ID/export" \
  -H "X-API-KEY: $API_KEY" \
  -o results.csv

# Compter les numéros valides
grep ",true,true," results.csv | wc -l

# Compter les numéros invalides
grep ",true,false," results.csv | wc -l
```

---

## 🐛 8. Dépannage

### Erreur: "WhatsApp not configured"

```bash
# Vérifier la configuration WhatsApp du workspace
curl "http://localhost:3000/api/workspaces/$WORKSPACE_ID" \
  -H "X-API-KEY: $API_KEY" | jq '.workspace | {whatsapp_phone_number_id, has_token: (.whatsapp_access_token != null)}'
```

### Erreur: Rate limit dépassé

```bash
# Vérifier les limites dans .env
cat .env | grep BULK_VERIFICATION
```

### Job bloqué en "processing"

```sql
-- Réinitialiser le job
UPDATE bulk_verification_jobs
SET status = 'failed'
WHERE id = 'JOB_ID' AND status = 'processing';
```

---

## 📚 Ressources

- **API Documentation**: `API_DOCUMENTATION.md`
- **API Keys Guide**: `API_KEYS_GUIDE.md`
- **Deployment Guide**: `DEPLOYMENT.md`
- **Postman Collection**: `postman_collection.json`

---

## ✅ Checklist de Test

Avant la mise en production:

- [ ] Tests unitaires passent (npm test)
- [ ] Bulk verification fonctionne (10 numéros)
- [ ] Export CSV fonctionne
- [ ] Rate limiting testé
- [ ] Webhooks WhatsApp configurés
- [ ] Logs vérifiés
- [ ] Base de données optimisée
- [ ] API Keys créées pour production
- [ ] Variables d'environnement configurées
