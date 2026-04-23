-- 同じカテゴリ・同じ名前でもサブカテゴリが異なれば追加可能にする
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_category_id_name_key;
CREATE UNIQUE INDEX products_category_id_subcategory_id_name_key
  ON products (category_id, COALESCE(subcategory_id, '00000000-0000-0000-0000-000000000000'::uuid), name);
