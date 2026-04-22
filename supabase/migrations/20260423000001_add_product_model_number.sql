-- 商品に型番カラムを追加（例: 110/080, 201/165）
ALTER TABLE products ADD COLUMN model_number TEXT;
