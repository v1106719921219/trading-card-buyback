-- 振込チェック済みフラグを追加
ALTER TABLE orders ADD COLUMN payment_checked boolean NOT NULL DEFAULT false;
