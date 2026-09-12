BEGIN;
REVOKE INSERT ON public.orders FROM anon;
DROP POLICY IF EXISTS orders_insert_anon ON public.orders;
DROP POLICY IF EXISTS order_items_insert_staff ON public.order_items;
DROP POLICY IF EXISTS order_items_delete_staff ON public.order_items;
DROP POLICY IF EXISTS app_settings_select_authenticated ON public.app_settings;

CREATE POLICY order_items_insert_staff ON public.order_items FOR INSERT TO authenticated
 WITH CHECK (tenant_id=public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN ('admin','manager','staff'));
CREATE POLICY order_items_delete_staff ON public.order_items FOR DELETE TO authenticated
 USING (tenant_id=public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN ('admin','manager','staff'));

-- Restrictive policies intersect every old permissive policy.
DROP POLICY IF EXISTS order_items_tenant_boundary ON public.order_items;
CREATE POLICY order_items_tenant_boundary ON public.order_items AS RESTRICTIVE FOR ALL TO authenticated
 USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.tenant_id=public.get_user_tenant_id(auth.uid())))
 WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.tenant_id=public.get_user_tenant_id(auth.uid())) AND (product_id IS NULL OR EXISTS (SELECT 1 FROM public.products p WHERE p.id=product_id AND p.tenant_id=public.get_user_tenant_id(auth.uid()))));
DROP POLICY IF EXISTS settings_tenant_boundary ON public.app_settings;
CREATE POLICY settings_tenant_boundary ON public.app_settings AS RESTRICTIVE FOR ALL TO authenticated
 USING (tenant_id = public.get_user_tenant_id(auth.uid())) WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE TABLE IF NOT EXISTS public.security_audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id), actor_id uuid,
 action text NOT NULL, record_id uuid, details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.security_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_audit_events FROM anon, authenticated;
GRANT SELECT ON public.security_audit_events TO authenticated;
GRANT ALL ON public.security_audit_events TO service_role;
DROP POLICY IF EXISTS security_audit_read ON public.security_audit_events;
CREATE POLICY security_audit_read ON public.security_audit_events FOR SELECT TO authenticated
 USING (tenant_id=public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN ('admin','manager') AND auth.jwt()->>'aal'='aal2');

CREATE OR REPLACE FUNCTION public.guard_order_sensitive_changes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r text; t uuid; fields text[] := ARRAY[]::text[]; bank_changed boolean; identity_changed boolean;
BEGIN
 bank_changed := (NEW.bank_name,NEW.bank_branch,NEW.bank_account_type,NEW.bank_account_number,NEW.bank_account_holder) IS DISTINCT FROM (OLD.bank_name,OLD.bank_branch,OLD.bank_account_type,OLD.bank_account_number,OLD.bank_account_holder);
 identity_changed := (NEW.kyc_request_id,NEW.identity_verified_at) IS DISTINCT FROM (OLD.kyc_request_id,OLD.identity_verified_at);
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  SELECT role,tenant_id INTO r,t FROM public.profiles WHERE id=auth.uid();
  IF t IS DISTINCT FROM OLD.tenant_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN RAISE EXCEPTION 'Tenant mismatch'; END IF;
  IF bank_changed OR identity_changed OR NEW.paid_at IS DISTINCT FROM OLD.paid_at OR
    (NEW.status IS DISTINCT FROM OLD.status AND (NEW.status IN ('振込済','振込確認済') OR OLD.status IN ('振込済','振込確認済'))) THEN
   IF r IS NULL OR r NOT IN ('admin','manager') OR auth.jwt()->>'aal' IS DISTINCT FROM 'aal2' THEN RAISE EXCEPTION 'Privileged MFA session required'; END IF;
  END IF;
  IF OLD.status IN ('振込済','振込確認済') AND NEW.status NOT IN ('振込済','振込確認済') AND r IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Only admin can reopen a paid order'; END IF;
 END IF;
 -- Enforce KYC at the same atomic boundary as payment status, including service-role paths.
 IF NEW.status IN ('振込済','振込確認済') AND NEW.status IS DISTINCT FROM OLD.status AND NEW.kyc_request_id IS NOT NULL THEN
  IF NEW.identity_verified_at IS NULL OR NOT EXISTS(SELECT 1 FROM public.kyc_requests k WHERE k.id=NEW.kyc_request_id AND k.tenant_id=NEW.tenant_id AND k.status='approved') THEN RAISE EXCEPTION 'KYC approval required'; END IF;
 END IF;
 IF bank_changed THEN fields:=array_append(fields,'bank'); END IF;
 IF identity_changed THEN fields:=array_append(fields,'identity'); END IF;
 IF NEW.status IS DISTINCT FROM OLD.status THEN fields:=array_append(fields,'status'); END IF;
 IF cardinality(fields)>0 THEN
  INSERT INTO public.security_audit_events(tenant_id,actor_id,action,record_id,details) VALUES(NEW.tenant_id,auth.uid(),'order_changed',NEW.id,jsonb_build_object('fields',fields,'old_status',OLD.status,'new_status',NEW.status));
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_order_sensitive_changes() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_guard_order_sensitive_changes ON public.orders;
CREATE TRIGGER trg_guard_order_sensitive_changes BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_order_sensitive_changes();

CREATE OR REPLACE FUNCTION public.replace_owned_order_items(p_tenant uuid,p_order uuid,p_items jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.orders%ROWTYPE; item record; product public.products%ROWTYPE; old_quantity bigint; total numeric:=0;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order AND tenant_id=p_tenant FOR UPDATE;
 IF NOT FOUND OR o.status NOT IN ('申込','承認待ち') THEN RAISE EXCEPTION 'Order not editable'; END IF;
 IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid items'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x WHERE NOT (coalesce(x->>'quantity','') ~ '^[0-9]+$') OR NOT (coalesce(x->>'unit_price','') ~ '^[0-9]+$')) THEN RAISE EXCEPTION 'Invalid amount'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_items) AS x(product_id uuid,quantity bigint) GROUP BY product_id HAVING sum(quantity) NOT BETWEEN 1 AND 9999) THEN RAISE EXCEPTION 'Invalid total quantity'; END IF;
 FOR item IN SELECT x.product_id, x.unit_price, sum(x.quantity)::bigint AS quantity FROM jsonb_to_recordset(p_items) AS x(product_id uuid,unit_price numeric,quantity bigint) GROUP BY x.product_id,x.unit_price LOOP
  IF item.quantity NOT BETWEEN 1 AND 9999 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
  SELECT * INTO product FROM public.products WHERE id=item.product_id AND tenant_id=p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid product'; END IF;
  SELECT coalesce(sum(quantity),0) INTO old_quantity FROM public.order_items WHERE order_id=p_order AND tenant_id=p_tenant AND product_id=item.product_id AND unit_price=item.unit_price;
  IF item.quantity>old_quantity AND (product.price IS DISTINCT FROM item.unit_price OR product.price <= 0 OR NOT product.is_active OR NOT product.show_in_price_list) THEN RAISE EXCEPTION 'Extra units must use current available price'; END IF;
  total:=total+item.quantity*item.unit_price;
 END LOOP;
 IF total>9007199254740991 THEN RAISE EXCEPTION 'Amount too large'; END IF;
 DELETE FROM public.order_items WHERE order_id=p_order AND tenant_id=p_tenant;
 INSERT INTO public.order_items(order_id,tenant_id,product_id,product_name,unit_price,quantity)
 SELECT p_order,p_tenant,x.product_id,p.name,x.unit_price,sum(x.quantity)::integer FROM jsonb_to_recordset(p_items) AS x(product_id uuid,unit_price numeric,quantity integer) JOIN public.products p ON p.id=x.product_id AND p.tenant_id=p_tenant GROUP BY x.product_id,p.name,x.unit_price;
 UPDATE public.orders SET total_amount=total WHERE id=p_order AND tenant_id=p_tenant;
 INSERT INTO public.security_audit_events(tenant_id,action,record_id,details) VALUES(p_tenant,'customer_items_changed',p_order,jsonb_build_object('total_amount',total));
END $$;
REVOKE ALL ON FUNCTION public.replace_owned_order_items(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.replace_owned_order_items(uuid,uuid,jsonb) TO service_role;
COMMIT;
