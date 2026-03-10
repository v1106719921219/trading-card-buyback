-- 注文番号を日付ベース（BB-YYYYMMDD-NNNN）から通し番号（BB-NNNN）に変更
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    max_number INTEGER;
    new_order_number TEXT;
BEGIN
    -- 新フォーマット（BB-NNNN）の最大番号を取得
    SELECT COALESCE(MAX(
      CAST(SUBSTRING(order_number FROM '^BB-(\d+)$') AS INTEGER)
    ), 0) INTO max_number
    FROM orders
    WHERE order_number ~ '^BB-\d+$';

    new_order_number := 'BB-' || lpad((max_number + 1)::TEXT, 4, '0');

    NEW.order_number = new_order_number;
    RETURN NEW;
END;
$$;
