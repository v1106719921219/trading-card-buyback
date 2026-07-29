-- スニダン相場比較用カラム（管理画面のみで使用）
ALTER TABLE products ADD COLUMN IF NOT EXISTS snkrdunk_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS market_price INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS market_listing_count INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS market_top5_prices JSONB;
ALTER TABLE products ADD COLUMN IF NOT EXISTS market_price_updated_at TIMESTAMPTZ;
