-- 到着日カラムを追加（千葉テナントの検品時に使用）
ALTER TABLE orders ADD COLUMN arrival_date DATE NULL;
