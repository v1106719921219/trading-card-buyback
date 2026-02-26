-- 商品削除時に価格履歴が連鎖削除されないようにする
ALTER TABLE product_price_history
  DROP CONSTRAINT product_price_history_product_id_fkey;

ALTER TABLE product_price_history
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE product_price_history
  ADD CONSTRAINT product_price_history_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
