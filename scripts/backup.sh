#!/bin/bash
# Supabase DBバックアップスクリプト
# 使い方: ./scripts/backup.sh

set -e

BACKUP_DIR="$(dirname "$0")/../backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "スキーマをバックアップ中..."
npx supabase db dump --linked -f "$BACKUP_DIR/schema_$TIMESTAMP.sql"

echo "データをバックアップ中..."
npx supabase db dump --linked --data-only -f "$BACKUP_DIR/data_$TIMESTAMP.sql"

# 30日以上前のバックアップを削除
find "$BACKUP_DIR" -name "*.sql" -mtime +30 -delete 2>/dev/null || true

echo "バックアップ完了: $BACKUP_DIR/*_$TIMESTAMP.sql"
