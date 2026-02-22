-- Add returned_quantity to order_items
ALTER TABLE order_items ADD COLUMN returned_quantity INTEGER DEFAULT 0;
