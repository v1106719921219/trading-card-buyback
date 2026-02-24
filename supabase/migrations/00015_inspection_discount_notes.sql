-- 検品時の減額と検品メモカラムを追加
ALTER TABLE orders ADD COLUMN inspection_discount integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN inspection_notes text;
