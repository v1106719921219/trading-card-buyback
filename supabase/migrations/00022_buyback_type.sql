-- 買取種別カラム追加（AR美品 / 最低保証）
ALTER TABLE orders ADD COLUMN buyback_type TEXT;

-- CHECK制約: 許可される値のみ
ALTER TABLE orders ADD CONSTRAINT orders_buyback_type_check
  CHECK (buyback_type IS NULL OR buyback_type IN ('ar_quality', 'minimum_guarantee'));
