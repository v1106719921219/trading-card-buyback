#!/bin/bash
# 指定したマイグレーションSQLをSupabaseに適用する
# 実行: bash scripts/apply-office-guard-migration.sh [マイグレーションファイル名] [tokyo|chiba|both]
# 第1引数省略時は supabase/migrations の最新ファイル、第2引数省略時は両方に適用
set -euo pipefail

cd "$(dirname "$0")/.."

FILE="${1:-$(ls supabase/migrations/*.sql | sort | tail -1)}"
[ -f "$FILE" ] || FILE="supabase/migrations/$1"
echo "適用するSQL: $FILE"

TARGET="${2:-both}"
case "$TARGET" in
  tokyo) REFS="hbvkaidvrwgskjtvvwfw" ;;
  chiba) REFS="fqbtulaerxrnekbkjlhu" ;;
  *)     REFS="hbvkaidvrwgskjtvvwfw fqbtulaerxrnekbkjlhu" ;;
esac

TOKEN_RAW=$(security find-generic-password -s "Supabase CLI" -a supabase -w)
TOKEN=$(printf '%s' "$TOKEN_RAW" | sed 's/^go-keyring-base64://' | base64 -d 2>/dev/null || printf '%s' "$TOKEN_RAW")
SQL=$(cat "$FILE")

for REF in $REFS; do
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
VERSION=$(basename "$FILE" | cut -d_ -f1)
supabase migration repair --status applied "$VERSION" 2>/dev/null || true
echo "完了"
