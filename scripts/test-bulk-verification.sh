#!/bin/bash

# Script de test pour Bulk Verification
# Usage: ./scripts/test-bulk-verification.sh

set -e

# Couleurs pour l'affichage
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:3000}"
API_KEY="${API_KEY}"
WORKSPACE_ID="${WORKSPACE_ID}"

# Fonction d'aide
show_help() {
    echo "Usage: ./scripts/test-bulk-verification.sh [options]"
    echo ""
    echo "Options:"
    echo "  -k, --api-key KEY        API Key à utiliser"
    echo "  -w, --workspace ID       Workspace ID"
    echo "  -u, --url URL            URL de l'API (défaut: http://localhost:3000)"
    echo "  -n, --numbers COUNT      Nombre de numéros à tester (défaut: 5)"
    echo "  -h, --help               Afficher cette aide"
    echo ""
    echo "Variables d'environnement:"
    echo "  API_KEY                  Clé API"
    echo "  WORKSPACE_ID             ID du workspace"
    echo "  API_URL                  URL de l'API"
}

# Parse arguments
NUMBERS_COUNT=5

while [[ $# -gt 0 ]]; do
    case $1 in
        -k|--api-key)
            API_KEY="$2"
            shift 2
            ;;
        -w|--workspace)
            WORKSPACE_ID="$2"
            shift 2
            ;;
        -u|--url)
            API_URL="$2"
            shift 2
            ;;
        -n|--numbers)
            NUMBERS_COUNT="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "Option inconnue: $1"
            show_help
            exit 1
            ;;
    esac
done

# Vérifier les paramètres requis
if [ -z "$API_KEY" ]; then
    echo -e "${RED}❌ API_KEY est requis${NC}"
    echo "Utilisez -k ou définissez la variable API_KEY"
    exit 1
fi

if [ -z "$WORKSPACE_ID" ]; then
    echo -e "${RED}❌ WORKSPACE_ID est requis${NC}"
    echo "Utilisez -w ou définissez la variable WORKSPACE_ID"
    exit 1
fi

echo -e "${BLUE}🧪 Test de Bulk Verification${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "API URL:      ${GREEN}$API_URL${NC}"
echo -e "Workspace:    ${GREEN}$WORKSPACE_ID${NC}"
echo -e "Numéros:      ${GREEN}$NUMBERS_COUNT${NC}"
echo ""

# Générer des numéros de test (format français pour l'exemple)
generate_test_numbers() {
    local count=$1
    local numbers="["
    for i in $(seq 1 $count); do
        # Numéros français fictifs
        local num=$(printf "+3361234%04d" $i)
        if [ $i -eq $count ]; then
            numbers="$numbers\"$num\""
        else
            numbers="$numbers\"$num\","
        fi
    done
    numbers="$numbers]"
    echo $numbers
}

PHONE_NUMBERS=$(generate_test_numbers $NUMBERS_COUNT)

# 1. Démarrer la vérification
echo -e "${YELLOW}📤 Étape 1: Démarrage de la vérification...${NC}"

RESPONSE=$(curl -s -X POST "$API_URL/api/bulk-verification/start" \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: $API_KEY" \
  -d "{
    \"workspace_id\": \"$WORKSPACE_ID\",
    \"phone_numbers\": $PHONE_NUMBERS,
    \"auto_add_to_contacts\": false
  }")

# Vérifier si la requête a réussi
if echo "$RESPONSE" | jq -e '.job.id' > /dev/null 2>&1; then
    JOB_ID=$(echo $RESPONSE | jq -r '.job.id')
    echo -e "${GREEN}✅ Job créé avec succès!${NC}"
    echo -e "   Job ID: ${GREEN}$JOB_ID${NC}"
else
    echo -e "${RED}❌ Erreur lors de la création du job${NC}"
    echo "$RESPONSE" | jq '.'
    exit 1
fi

echo ""

# 2. Surveiller la progression
echo -e "${YELLOW}📊 Étape 2: Surveillance de la progression...${NC}"
echo ""

MAX_WAIT=60  # Attendre max 60 secondes
WAIT_COUNT=0

while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    STATUS_RESPONSE=$(curl -s "$API_URL/api/bulk-verification/$JOB_ID" \
      -H "X-API-KEY: $API_KEY")

    STATUS=$(echo $STATUS_RESPONSE | jq -r '.job.status')
    PERCENTAGE=$(echo $STATUS_RESPONSE | jq -r '.job.percentage')
    PROCESSED=$(echo $STATUS_RESPONSE | jq -r '.job.processed_count')
    VERIFIED=$(echo $STATUS_RESPONSE | jq -r '.job.verified_count')
    FAILED=$(echo $STATUS_RESPONSE | jq -r '.job.failed_count')

    echo -ne "\r   Status: ${BLUE}$STATUS${NC} | Progress: ${GREEN}$PERCENTAGE%${NC} | Processed: $PROCESSED/$NUMBERS_COUNT | ✅ $VERIFIED | ❌ $FAILED"

    if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
        echo ""
        break
    fi

    sleep 2
    WAIT_COUNT=$((WAIT_COUNT + 2))
done

echo ""
echo ""

# 3. Afficher les résultats
if [ "$STATUS" = "completed" ]; then
    echo -e "${GREEN}✅ Vérification terminée avec succès!${NC}"
    echo ""
    echo -e "${YELLOW}📋 Étape 3: Récupération des résultats détaillés...${NC}"

    RESULTS=$(curl -s "$API_URL/api/bulk-verification/$JOB_ID/results" \
      -H "X-API-KEY: $API_KEY")

    echo ""
    echo -e "${BLUE}Résultats par numéro:${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    echo $RESULTS | jq -r '.results[] | "  \(.phone): \(if .whatsapp_exists then "✅ Valide (WhatsApp ID: \(.wa_id))" else "❌ Non trouvé sur WhatsApp" end)"'

    echo ""
    echo -e "${BLUE}Statistiques:${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo $STATUS_RESPONSE | jq -r '.job | "  Total: \(.total_numbers)\n  Vérifiés: \(.verified_count)\n  Échoués: \(.failed_count)\n  Progression: \(.percentage)%"'

    echo ""
    echo -e "${YELLOW}📥 Étape 4: Export CSV...${NC}"

    CSV_FILE="verification-results-$(date +%Y%m%d-%H%M%S).csv"
    curl -s -X POST "$API_URL/api/bulk-verification/$JOB_ID/export" \
      -H "X-API-KEY: $API_KEY" \
      -o "$CSV_FILE"

    if [ -f "$CSV_FILE" ]; then
        echo -e "${GREEN}✅ Résultats exportés: $CSV_FILE${NC}"
        echo ""
        echo -e "${BLUE}Aperçu du CSV:${NC}"
        head -n 5 "$CSV_FILE"
    fi

elif [ "$STATUS" = "failed" ]; then
    echo -e "${RED}❌ La vérification a échoué${NC}"
    echo $STATUS_RESPONSE | jq '.job'
else
    echo -e "${YELLOW}⏱️  Timeout: Le job est toujours en cours${NC}"
    echo -e "   Job ID: $JOB_ID"
    echo -e "   Vérifiez manuellement avec: curl $API_URL/api/bulk-verification/$JOB_ID -H 'X-API-KEY: $API_KEY'"
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✨ Test terminé!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
