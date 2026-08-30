#!/bin/bash
# 検品完了の事務所制限マイグレーションを東京・千葉の両Supabaseに適用する
# 実行: bash scripts/apply-office-guard-migration.sh
set -euo pipefail

cd "$(dirname "$0")/.."

TOKEN_RAW=$(security find-generic-password -s "Supabase CLI" -a supabase -w)
TOKEN=$(printf '%s' "$TOKEN_RAW" | sed 's/^go-keyring-base64://' | base64 -d 2>/dev/null || printf '%s' "$TOKEN_RAW")
SQL=$(cat supabase/migrations/20260830000001_add_profile_office_inspection_guard.sql)

for REF in hbvkaidvrwgskjtvvwfw fqbtulaerxrnekbkjlhu; do
  NAME=$([ "$REF" = "hbvkaidvrwgskjtvvwfw" ] && echo "東京" || echo "千葉")
  echo "=== $NAME ($REF) に適用中... ==="
  RESULT=$(curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg q "$SQL" '{query:$q}')")
  echo "$RESULT"
  echo "$RESULT" | grep -qi error && { echo "❌ $NAME でエラー"; exit 1; }
  echo "✅ $NAME 適用完了"
done

# 東京はマイグレーション履歴にも記録（supabase CLI link済みのため）
supabase migration repair --status applied 20260830000001 2>/dev/null || true
echo "完了"
