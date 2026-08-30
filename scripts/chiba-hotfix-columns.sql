-- 緊急対応: 千葉の申込エラー修正（ordersに不足カラムだけ追加・FKなし）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kyc_request_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMPTZ;
