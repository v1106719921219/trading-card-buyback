-- Add show_in_price_list column to products (default true for existing products)
ALTER TABLE products ADD COLUMN show_in_price_list BOOLEAN NOT NULL DEFAULT true;

-- Products with price 0 should default to not showing
UPDATE products SET show_in_price_list = false WHERE price = 0;
