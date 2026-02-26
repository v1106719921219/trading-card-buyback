-- 注文削除後に番号が重複する問題を修正
-- COUNT → MAX に変更して、既存の最大番号の次を採番する
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    today_str TEXT;
    max_number INTEGER;
    new_order_number TEXT;
BEGIN
    today_str := to_char(now() AT TIME ZONE 'Asia/Tokyo', 'YYYYMMDD');

    -- 今日の最大番号を取得
    SELECT COALESCE(MAX(
      CAST(SUBSTRING(order_number FROM 'BB-' || today_str || '-(\d+)') AS INTEGER)
    ), 0) INTO max_number
    FROM orders
    WHERE order_number LIKE 'BB-' || today_str || '-%';

    new_order_number := 'BB-' || today_str || '-' || lpad((max_number + 1)::TEXT, 4, '0');

    NEW.order_number = new_order_number;
    RETURN NEW;
END;
$$;
