-- 特別リンク機能: 指定日の価格で表示するための price_date カラム追加
ALTER TABLE orders ADD COLUMN price_date DATE;
