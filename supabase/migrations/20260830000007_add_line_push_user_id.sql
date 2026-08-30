-- LINE送信用のユーザーID（本物アカウント@215txiig用）
-- line_user_id は閲覧用（LIFF・別プロバイダー）、line_push_user_id は送信用（本物アカウント）と役割を分ける
ALTER TABLE orders ADD COLUMN IF NOT EXISTS line_push_user_id TEXT;
