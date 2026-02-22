-- Add sort_order column to products
ALTER TABLE products ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Initialize sort_order based on current name order within each category
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY name) AS rn
  FROM products
)
UPDATE products SET sort_order = ranked.rn FROM ranked WHERE products.id = ranked.id;
