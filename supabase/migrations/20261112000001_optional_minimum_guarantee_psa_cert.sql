CREATE OR REPLACE FUNCTION public.check_buyback_psa_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = '検品完了' AND OLD.status = '発送済' AND EXISTS (
    SELECT 1
    FROM order_items i
    LEFT JOIN products p ON p.id = i.product_id
    LEFT JOIN subcategories s ON s.id = p.subcategory_id
    WHERE i.order_id = NEW.id
      AND (s.name = 'PSA10' OR i.product_name ~* 'PSA' OR cardinality(i.psa_cert_numbers) > 0)
      AND cardinality(i.psa_cert_numbers) <> greatest(0, coalesce(i.inspected_quantity, 0) - coalesce(i.returned_quantity, 0))
      AND NOT (i.product_name LIKE '%最低保証%' AND (coalesce(s.name = 'PSA10', false) OR i.product_name ~* 'PSA'))
  ) THEN
    RAISE EXCEPTION 'PSAの買取枚数分の鑑定番号を読み取ってください';
  END IF;
  RETURN NEW;
END;
$function$;
