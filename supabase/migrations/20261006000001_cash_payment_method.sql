BEGIN;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method text CHECK (payment_method IN ('bank_transfer','cash'));
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_date date;
CREATE OR REPLACE FUNCTION public.guard_order_payment_method() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF (NEW.payment_method,NEW.payment_date) IS DISTINCT FROM (OLD.payment_method,OLD.payment_date) THEN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (
   public.get_user_role(auth.uid()) NOT IN ('admin','manager') OR public.get_user_role(auth.uid()) IS NULL
   OR public.get_user_tenant_id(auth.uid()) IS DISTINCT FROM OLD.tenant_id
   OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR auth.jwt()->>'aal' IS DISTINCT FROM 'aal2'
  ) THEN RAISE EXCEPTION 'Privileged MFA session required'; END IF;
 END IF;
 IF OLD.status IN ('振込済','振込確認済') AND NEW.status NOT IN ('振込済','振込確認済') THEN
  NEW.payment_method:=NULL; NEW.payment_date:=NULL; NEW.paid_at:=NULL;
 END IF;
 IF NEW.payment_method IS NOT NULL AND (NEW.status NOT IN ('振込済','振込確認済') OR NEW.payment_date IS NULL OR NEW.paid_at IS NULL) THEN
  RAISE EXCEPTION 'Payment method requires completed payment and date';
 END IF;
 IF NEW.payment_date > (now() AT TIME ZONE 'Asia/Tokyo')::date THEN RAISE EXCEPTION 'Future payment date is invalid'; END IF;
 IF (NEW.payment_method,NEW.payment_date) IS DISTINCT FROM (OLD.payment_method,OLD.payment_date) THEN
  INSERT INTO public.security_audit_events(tenant_id,actor_id,action,record_id,details)
  VALUES(NEW.tenant_id,auth.uid(),'payment_method_changed',NEW.id,jsonb_build_object('old_method',OLD.payment_method,'new_method',NEW.payment_method,'old_date',OLD.payment_date,'new_date',NEW.payment_date));
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_order_payment_method() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_order_payment_method ON public.orders;
CREATE TRIGGER trg_order_payment_method BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_order_payment_method();
COMMIT;
