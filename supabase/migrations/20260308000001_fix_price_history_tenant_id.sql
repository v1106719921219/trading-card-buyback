-- Fix: マルチテナント移行時にトリガー関数の更新が漏れていた
-- 全トリガー関数のINSERTにtenant_idを追加

-- 1. record_price_change(): product_price_historyへのINSERT
CREATE OR REPLACE FUNCTION record_price_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF OLD.price IS DISTINCT FROM NEW.price THEN
        INSERT INTO product_price_history (product_id, old_price, new_price, changed_by, tenant_id)
        VALUES (NEW.id, OLD.price, NEW.price, auth.uid(), NEW.tenant_id);
    END IF;
    RETURN NEW;
END;
$$;

-- 2. record_status_change(): order_status_historyへのINSERT
CREATE OR REPLACE FUNCTION record_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, tenant_id)
        VALUES (NEW.id, OLD.status, NEW.status, auth.uid(), NEW.tenant_id);
    END IF;
    RETURN NEW;
END;
$$;
