BEGIN;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS kyc_deferred boolean NOT NULL DEFAULT false;

-- Keep the requirement permanently: changing status or deleting a request must not bypass it.
CREATE OR REPLACE FUNCTION public.guard_deferred_order_kyc() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.kyc_deferred AND NOT NEW.kyc_deferred THEN
  RAISE EXCEPTION '本人確認待ちの受付履歴は解除できません';
 END IF;
 IF NEW.kyc_deferred AND (NEW.status IN ('振込済','振込確認済') OR NEW.paid_amount>0) THEN
  IF NEW.identity_verified_at IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.kyc_requests k WHERE k.id=NEW.kyc_request_id AND k.tenant_id=NEW.tenant_id AND k.status='approved'
  ) THEN RAISE EXCEPTION '本人確認待ちです。承認完了まで支払いできません'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_deferred_order_kyc() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_deferred_order_kyc BEFORE INSERT OR UPDATE ON public.orders
 FOR EACH ROW EXECUTE FUNCTION public.guard_deferred_order_kyc();

-- Covers partial cash/bank payments, RPC calls and direct service-role inserts.
CREATE OR REPLACE FUNCTION public.guard_deferred_kyc_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.orders;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=NEW.order_id AND tenant_id=NEW.tenant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
 IF NEW.voided_at IS NULL AND o.kyc_deferred AND (o.identity_verified_at IS NULL OR NOT EXISTS (
  SELECT 1 FROM public.kyc_requests k WHERE k.id=o.kyc_request_id AND k.tenant_id=o.tenant_id AND k.status='approved'
 )) THEN RAISE EXCEPTION '本人確認待ちです。承認完了まで支払いできません'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_deferred_kyc_payment() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_deferred_kyc_payment BEFORE INSERT OR UPDATE ON public.order_payments
 FOR EACH ROW EXECUTE FUNCTION public.guard_deferred_kyc_payment();
NOTIFY pgrst, 'reload schema';
COMMIT;
