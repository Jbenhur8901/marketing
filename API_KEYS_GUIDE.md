# Guide API Keys Management

## 🔑 Vue d'Ensemble

Ce système gère l'authentification via des **clés API stockées en base de données**. Chaque workspace peut avoir plusieurs clés API avec des permissions et limitations différentes.

### Avantages

✅ **Multi-clés par workspace** - Créez des clés séparées pour dev/prod/CI
✅ **Révocation instantanée** - Révoquez une clé compromise sans affecter les autres
✅ **Tracking d'utilisation** - Suivez l'usage de chaque clé
✅ **Permissions granulaires** - Scopes : `read`, `write`, `admin`
✅ **Rate limiting par clé** - Limitez les requêtes par clé
✅ **Expiration automatique** - Définissez une date d'expiration
✅ **Sécurité renforcée** - Les clés sont hashées (jamais stockées en clair)

---

## 🚀 Démarrage Rapide

### 1. Exécuter la Migration

```bash
# Via Supabase Dashboard
# Allez dans SQL Editor et exécutez:
# supabase/migrations/20240101000005_api_keys_management.sql
```

### 2. Créer Votre Première Clé API

```bash
# Endpoint : POST /api/api-keys
curl -X POST http://localhost:3000/api/api-keys \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: <clé-existante-ou-temporaire>" \
  -d '{
    "workspace_id": "uuid-de-votre-workspace",
    "name": "Production API Key",
    "scopes": ["read", "write"],
    "rate_limit_per_minute": 60
  }'
```

**Réponse :**
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
    "expires_at": null
  }
}
```

⚠️ **IMPORTANT :** La clé complète (`sk_live_...`) est affichée **UNE SEULE FOIS**. Sauvegardez-la immédiatement !

### 3. Utiliser la Clé dans Vos Requêtes

```javascript
// Exemple avec fetch
const response = await fetch('http://localhost:3000/api/contacts', {
  headers: {
    'X-API-KEY': 'sk_live_XXXXXXXXXXXXXXXXXXXX_your_key_here_XXXXXXXXXXXXXXXXXXXX',
    'Content-Type': 'application/json'
  }
});
```

```bash
# Exemple avec curl
curl http://localhost:3000/api/contacts \
  -H "X-API-KEY: sk_live_a3f8d9..."
```

---

## 📋 Endpoints API

### 1. Créer une Clé API

**`POST /api/api-keys`**

**Body :**
```json
{
  "workspace_id": "uuid",
  "name": "Ma Clé API",
  "scopes": ["read", "write", "admin"],
  "rate_limit_per_minute": 60,
  "expires_at": "2026-12-31T23:59:59Z" // optionnel
}
```

**Scopes disponibles :**
- `read` - Lecture seule (GET)
- `write` - Lecture + Écriture (GET, POST, PUT)
- `admin` - Tous les droits (GET, POST, PUT, DELETE)

---

### 2. Lister les Clés

**`GET /api/api-keys?workspace_id=uuid`**

**Réponse :**
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

---

### 3. Obtenir les Détails d'une Clé

**`GET /api/api-keys/:id`**

---

### 4. Mettre à Jour une Clé

**`PUT /api/api-keys/:id`**

**Body :**
```json
{
  "name": "Nouveau Nom",
  "scopes": ["read"],
  "rate_limit_per_minute": 30
}
```

---

### 5. Révoquer une Clé

**`POST /api/api-keys/:id/revoke`**

**Body :**
```json
{
  "reason": "Clé compromise - rotation de sécurité"
}
```

Une fois révoquée, la clé ne peut plus être utilisée.

---

### 6. Supprimer une Clé

**`DELETE /api/api-keys/:id`**

Suppression permanente (recommandé : utiliser `revoke` à la place).

---

### 7. Statistiques d'Utilisation

**`GET /api/api-keys/:id/usage`**

**Réponse :**
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

## 🔐 Format des Clés

Les clés suivent ce format :

```
sk_<type>_<random_64_chars>

Exemples:
- sk_live_XXXXXXXXXXXXXXXXXXXX_your_key_here_XXXXXXXXXXXXXXXXXXXX
- sk_test_XXXXXXXXXXXXXXXXXXXX_your_key_here_XXXXXXXXXXXXXXXXXXXX
```

- **`sk_`** : Préfixe (Secret Key)
- **`live`** ou **`test`** : Type (production vs développement)
- **64 caractères aléatoires** : Généré cryptographiquement

---

## 🛡️ Sécurité

### Stockage Sécurisé

❌ **Jamais en clair dans la DB** - Les clés sont hashées avec SHA-256
✅ **Affichée UNE fois** - Lors de la création uniquement
✅ **Prefix affiché** - Pour identification (`sk_live_abc123...`)

### Bonnes Pratiques

1. **Rotation régulière** - Changez vos clés tous les 90 jours
2. **Principe du moindre privilège** - Donnez uniquement les scopes nécessaires
3. **Clés séparées par environnement** - Dev, staging, prod
4. **Révocation immédiate** - En cas de compromission
5. **Monitoring** - Surveillez l'usage avec `/usage` endpoint
6. **Expiration** - Définissez `expires_at` pour les clés temporaires

---

## 🔧 Intégration Frontend

### Exemple React

```javascript
// src/api/client.js
const API_KEY = process.env.REACT_APP_API_KEY;
const API_URL = process.env.REACT_APP_API_URL;

export const apiClient = {
  async get(endpoint) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      headers: {
        'X-API-KEY': API_KEY,
      }
    });
    return response.json();
  },

  async post(endpoint, data) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'X-API-KEY': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return response.json();
  }
};

// Usage
const contacts = await apiClient.get('/api/contacts?workspace_id=uuid');
```

### Variables d'Environnement Frontend

```env
# .env.local
REACT_APP_API_KEY=sk_live_a3f8d9e2b1c4a5d6...
REACT_APP_API_URL=https://api.votre-domaine.com
```

---

## 📊 Scopes et Permissions

| Scope | GET | POST | PUT | DELETE |
|-------|-----|------|-----|--------|
| `read` | ✅ | ❌ | ❌ | ❌ |
| `write` | ✅ | ✅ | ✅ | ❌ |
| `admin` | ✅ | ✅ | ✅ | ✅ |

### Exemple avec Scope Limité

```javascript
// Middleware pour vérifier un scope spécifique
import { requireScope } from '../middleware/auth.js';

// Route nécessitant le scope 'write'
router.post('/api/contacts',
  authenticate,
  requireScope('write'),
  async (req, res) => {
    // Créer un contact
  }
);
```

---

## 🔍 Tracking et Monitoring

### Informations Trackées

- **Nombre total de requêtes** (`usage_count`)
- **Dernière utilisation** (`last_used_at`)
- **IP de dernière utilisation** (`last_used_ip`)
- **Statut** (`active`, `revoked`, `expired`)

### Alertes Recommandées

1. **Usage anormal** - Pic soudain de requêtes
2. **IP suspecte** - Nouvelle IP jamais vue
3. **Clé non utilisée** - Clé inactive depuis >30 jours
4. **Expiration proche** - Clé expire dans <7 jours

---

## 🧪 Tests

### Tester Votre Première Clé

```bash
# 1. Créer une clé
API_KEY=$(curl -X POST http://localhost:3000/api/api-keys \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "your-workspace-id",
    "name": "Test Key",
    "scopes": ["read"]
  }' | jq -r '.api_key')

# 2. Utiliser la clé
curl http://localhost:3000/api/contacts \
  -H "X-API-KEY: $API_KEY"

# 3. Vérifier l'usage
curl http://localhost:3000/api/api-keys/<key-id>/usage \
  -H "X-API-KEY: $API_KEY"
```

---

## ❓ FAQ

### Q: Où est stockée ma clé API ?
**R:** La clé est hashée (SHA-256) dans la table `api_keys`. La version en clair n'est jamais stockée.

### Q: J'ai perdu ma clé, que faire ?
**R:** Créez une nouvelle clé et révoquez l'ancienne. Il est impossible de récupérer une clé perdue.

### Q: Puis-je utiliser la même clé partout ?
**R:** Non recommandé. Créez des clés séparées pour chaque environnement et usage.

### Q: Combien de clés puis-je créer ?
**R:** Illimité par workspace, mais nous recommandons de limiter à 5-10 clés actives maximum.

### Q: Que se passe-t-il si ma clé expire ?
**R:** Les requêtes seront rejetées avec une erreur 403. Créez une nouvelle clé avant l'expiration.

---

## 🎯 Cas d'Usage

### 1. Environnements Séparés

```javascript
// Development
const DEV_KEY = 'sk_test_abc123...';

// Production
const PROD_KEY = 'sk_live_xyz789...';
```

### 2. CI/CD Pipelines

```yaml
# .github/workflows/deploy.yml
env:
  API_KEY: ${{ secrets.API_KEY }}
```

### 3. Applications Mobiles

Créez une clé avec scope `read` uniquement pour les apps mobiles.

### 4. Webhooks Externes

Créez une clé avec rate limit élevé pour les intégrations externes.

---

## 🔗 Ressources

- **Table Database :** `api_keys`
- **Migration SQL :** `/supabase/migrations/20240101000005_api_keys_management.sql`
- **Middleware :** `/src/middleware/auth.js`
- **Routes API :** `/src/routes/apiKeys.routes.js`

---

## ✅ Checklist de Sécurité

- [ ] Les clés sont générées cryptographiquement
- [ ] Les clés sont hashées en base
- [ ] Les clés ont des scopes limités
- [ ] Les clés ont des rate limits
- [ ] L'utilisation est trackée
- [ ] Les clés peuvent être révoquées
- [ ] Les clés peuvent expirer
- [ ] Les clés ne sont affichées qu'une fois

---

**Votre API est maintenant sécurisée avec un système de gestion de clés professionnel !** 🎉
