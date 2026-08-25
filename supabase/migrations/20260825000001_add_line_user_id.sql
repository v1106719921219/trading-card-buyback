-- LINE連携: 注文にお客様のLINE userIdを保存し、本人確認書類忘れの催促送信を記録する
ALTER TABLE orders ADD COLUMN IF NOT EXISTS line_user_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS id_reminder_sent_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_orders_line_user_id ON orders (line_user_id) WHERE line_user_id IS NOT NULL;
