-- 口座確認済みフラグを追加
ALTER TABLE orders ADD COLUMN bank_verified boolean NOT NULL DEFAULT false;
