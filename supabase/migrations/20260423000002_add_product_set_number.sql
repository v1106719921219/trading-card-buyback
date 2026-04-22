-- 商品にセット型番カラムを追加（例: SV8a, OP-01）
-- model_number = カード型番（例: 217/187）、set_number = セット型番（例: SV8a）
ALTER TABLE products ADD COLUMN set_number TEXT;
