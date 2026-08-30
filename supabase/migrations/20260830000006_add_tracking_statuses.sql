-- ヤマト追跡の自動チェック結果を保存（追跡番号ごとのステータス）
-- 形式: { "<追跡番号(数字のみ)>": { "status": "配達完了", "summary": "...", "last_event": "08月30日 12:34", "checked_at": "ISO日時" } }
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_statuses jsonb;
