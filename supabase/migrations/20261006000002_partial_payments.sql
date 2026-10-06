BEGIN;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_amount bigint NOT NULL DEFAULT 0 CHECK (paid_amount >= 0);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS bank_paid_amount bigint NOT NULL DEFAULT 0 CHECK (bank_paid_amount >= 0);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS bank_payment_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('cash','bank_transfer','mixed'));
CREATE TABLE public.order_payments (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
 method text NOT NULL CHECK (method IN ('cash','bank_transfer')),
 amount bigint NOT NULL CHECK (amount > 0),
 paid_on date NOT NULL,
 prior_status text NOT NULL,
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 voided_at timestamptz,
 voided_by uuid,
 void_reason text
);
CREATE INDEX order_payments_order ON public.order_payments(order_id);
ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_payments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.order_payments TO authenticated;
GRANT ALL ON public.order_payments TO service_role;
CREATE POLICY order_payments_read ON public.order_payments FOR SELECT TO authenticated USING (
 tenant_id=public.get_user_tenant_id(auth.uid()) AND
 (public.get_user_role(auth.uid())='staff' OR (public.get_user_role(auth.uid()) IN ('admin','manager') AND auth.jwt()->>'aal'='aal2'))
);

-- Summary columns must agree with the protected payment ledger, even for direct REST updates.
CREATE OR REPLACE FUNCTION public.guard_order_payment_method() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE n bigint; bank bigint; bank_n integer; last_date date; method text; has_ledger boolean; due bigint;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.paid_amount<>0 OR NEW.bank_paid_amount<>0 OR NEW.bank_payment_count<>0 THEN RAISE EXCEPTION 'Payment ledger required'; END IF;
  RETURN NEW;
 END IF;
 IF (NEW.payment_method,NEW.payment_date,NEW.paid_amount,NEW.bank_paid_amount,NEW.bank_payment_count) IS DISTINCT FROM
    (OLD.payment_method,OLD.payment_date,OLD.paid_amount,OLD.bank_paid_amount,OLD.bank_payment_count) THEN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (
   public.get_user_role(auth.uid()) NOT IN ('admin','manager') OR public.get_user_role(auth.uid()) IS NULL
   OR public.get_user_tenant_id(auth.uid()) IS DISTINCT FROM OLD.tenant_id
   OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR auth.jwt()->>'aal' IS DISTINCT FROM 'aal2'
  ) THEN RAISE EXCEPTION 'Privileged MFA session required'; END IF;
 END IF;
 SELECT EXISTS(SELECT 1 FROM public.order_payments WHERE order_id=NEW.id) INTO has_ledger;
 IF has_ledger THEN
  SELECT coalesce(sum(amount),0),coalesce(sum(amount) FILTER(WHERE p.method='bank_transfer'),0),
   count(*) FILTER(WHERE p.method='bank_transfer'),max(paid_on),
   CASE WHEN count(DISTINCT p.method)>1 THEN 'mixed' ELSE min(p.method) END
  INTO n,bank,bank_n,last_date,method FROM public.order_payments p WHERE order_id=NEW.id AND voided_at IS NULL;
  due:=coalesce(NEW.inspected_total_amount,NEW.total_amount)-coalesce(NEW.inspection_discount,0);
  IF (NEW.paid_amount,NEW.bank_paid_amount,NEW.bank_payment_count,NEW.payment_method,NEW.payment_date)
     IS DISTINCT FROM (n,bank,bank_n,method,last_date) THEN RAISE EXCEPTION 'Payment ledger mismatch'; END IF;
  IF n>due THEN RAISE EXCEPTION 'Cannot reduce order amount below payments; cancel the payment record first'; END IF;
  IF n>0 AND NEW.status='キャンセル' THEN RAISE EXCEPTION 'Cancel payment records before cancelling order'; END IF;
  IF (NEW.status IN ('振込済','振込確認済')) IS DISTINCT FROM (n>0 AND n=due) THEN RAISE EXCEPTION 'Paid status must match remaining balance'; END IF;
  IF n<due AND NEW.paid_at IS NOT NULL THEN RAISE EXCEPTION 'Partial payment is not full payment'; END IF;
 ELSE
  IF NEW.paid_amount<>0 OR NEW.bank_paid_amount<>0 OR NEW.bank_payment_count<>0 THEN RAISE EXCEPTION 'Payment ledger required'; END IF;
  IF OLD.status IN ('振込済','振込確認済') AND NEW.status NOT IN ('振込済','振込確認済') THEN
   NEW.payment_method:=NULL; NEW.payment_date:=NULL; NEW.paid_at:=NULL;
  END IF;
  IF NEW.payment_method IS NOT NULL AND (NEW.status NOT IN ('振込済','振込確認済') OR NEW.payment_date IS NULL OR NEW.paid_at IS NULL) THEN RAISE EXCEPTION 'Payment method requires completed payment and date'; END IF;
 END IF;
 IF NEW.payment_date > (now() AT TIME ZONE 'Asia/Tokyo')::date THEN RAISE EXCEPTION 'Future payment date is invalid'; END IF;
 IF (NEW.payment_method,NEW.payment_date,NEW.paid_amount) IS DISTINCT FROM (OLD.payment_method,OLD.payment_date,OLD.paid_amount) THEN
  INSERT INTO public.security_audit_events(tenant_id,actor_id,action,record_id,details)
  VALUES(NEW.tenant_id,auth.uid(),'payment_method_changed',NEW.id,jsonb_build_object('old_method',OLD.payment_method,'new_method',NEW.payment_method,'old_amount',OLD.paid_amount,'new_amount',NEW.paid_amount,'date',NEW.payment_date));
 END IF;
 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_order_payment_method ON public.orders;
CREATE TRIGGER trg_order_payment_method BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_order_payment_method();

CREATE FUNCTION public.record_order_payment(p_tenant uuid,p_order uuid,p_method text,p_amount bigint,p_paid_on date,p_request uuid,p_expected_updated_at timestamptz,p_require_full boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.orders; existing public.order_payments; n bigint; bank bigint; bank_n integer; last_date date; method text; due bigint;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND (
  public.get_user_role(auth.uid()) IS NULL OR public.get_user_role(auth.uid()) NOT IN ('admin','manager')
  OR public.get_user_tenant_id(auth.uid()) IS DISTINCT FROM p_tenant OR auth.jwt()->>'aal' IS DISTINCT FROM 'aal2'
 ) THEN RAISE EXCEPTION '支払登録の権限または二段階認証がありません'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order AND tenant_id=p_tenant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '注文が見つかりません'; END IF;
 SELECT * INTO existing FROM public.order_payments WHERE id=p_request;
 IF FOUND THEN
  IF (existing.order_id,existing.tenant_id,existing.method,existing.amount,existing.paid_on) IS DISTINCT FROM (p_order,p_tenant,p_method,p_amount,p_paid_on) OR existing.voided_at IS NOT NULL THEN RAISE EXCEPTION '登録済みの支払内容と一致しません'; END IF;
  RETURN existing.id;
 END IF;
 IF p_expected_updated_at IS NULL OR o.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION '注文が更新されました。再読み込みして金額を確認してください'; END IF;
 IF p_amount IS NULL OR p_amount<=0 OR p_method IS NULL OR p_method NOT IN ('cash','bank_transfer') OR p_paid_on IS NULL OR p_paid_on>(now() AT TIME ZONE 'Asia/Tokyo')::date OR p_request IS NULL THEN RAISE EXCEPTION '支払金額・方法・日付を確認してください'; END IF;
 IF o.status NOT IN ('申込','発送済','検品完了') THEN RAISE EXCEPTION 'この注文には支払いを追加できません'; END IF;
 IF o.kyc_request_id IS NOT NULL AND (o.identity_verified_at IS NULL OR NOT EXISTS(SELECT 1 FROM public.kyc_requests WHERE id=o.kyc_request_id AND tenant_id=p_tenant AND status='approved')) THEN RAISE EXCEPTION '本人確認の承認が必要です'; END IF;
 due:=coalesce(o.inspected_total_amount,o.total_amount)-coalesce(o.inspection_discount,0);
 IF p_require_full AND (o.status<>'検品完了' OR p_amount<>due-o.paid_amount) THEN RAISE EXCEPTION '残額が変更されています。再読み込みして振込額を確認してください'; END IF;
 IF p_amount>due-o.paid_amount THEN RAISE EXCEPTION '支払額が残額を超えています'; END IF;
 IF p_amount=due-o.paid_amount AND o.status<>'検品完了' THEN RAISE EXCEPTION '全額の支払完了は検品完了後に登録してください'; END IF;
 INSERT INTO public.order_payments(id,tenant_id,order_id,method,amount,paid_on,prior_status,created_by)
 VALUES(p_request,p_tenant,p_order,p_method,p_amount,p_paid_on,o.status,auth.uid());
 SELECT sum(amount),coalesce(sum(amount) FILTER(WHERE p.method='bank_transfer'),0),count(*) FILTER(WHERE p.method='bank_transfer'),max(paid_on),
 CASE WHEN count(DISTINCT p.method)>1 THEN 'mixed' ELSE min(p.method) END
 INTO n,bank,bank_n,last_date,method FROM public.order_payments p WHERE order_id=p_order AND voided_at IS NULL;
 UPDATE public.orders SET paid_amount=n,bank_paid_amount=bank,bank_payment_count=bank_n,payment_method=method,payment_date=last_date,
 status=CASE WHEN n=due THEN '振込済' ELSE o.status END,paid_at=CASE WHEN n=due THEN last_date::timestamp AT TIME ZONE 'Asia/Tokyo' ELSE NULL END,
 payment_checked=false,updated_at=clock_timestamp() WHERE id=p_order;
 INSERT INTO public.security_audit_events(tenant_id,actor_id,action,record_id,details) VALUES(p_tenant,auth.uid(),'payment_recorded',p_order,jsonb_build_object('payment_id',p_request,'method',p_method,'amount',p_amount,'paid_on',p_paid_on));
 RETURN p_request;
END $$;
REVOKE ALL ON FUNCTION public.record_order_payment(uuid,uuid,text,bigint,date,uuid,timestamptz,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_order_payment(uuid,uuid,text,bigint,date,uuid,timestamptz,boolean) TO authenticated,service_role;

CREATE FUNCTION public.void_order_payment(p_tenant uuid,p_order uuid,p_payment uuid,p_reason text,p_expected_updated_at timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.orders; pay public.order_payments; n bigint; bank bigint; bank_n integer; last_date date; method text; restore_status text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND (public.get_user_role(auth.uid()) IS DISTINCT FROM 'admin' OR public.get_user_tenant_id(auth.uid()) IS DISTINCT FROM p_tenant OR auth.jwt()->>'aal' IS DISTINCT FROM 'aal2') THEN RAISE EXCEPTION '支払取消は管理者のみ実行できます'; END IF;
 IF p_reason IS NULL OR length(trim(p_reason))<1 OR length(p_reason)>500 THEN RAISE EXCEPTION '取消理由を入力してください'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order AND tenant_id=p_tenant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '注文が見つかりません'; END IF;
 IF o.status='振込確認済' THEN RAISE EXCEPTION '会計確認済みです。会計担当者が確認状態を戻してから訂正してください'; END IF;
 SELECT * INTO pay FROM public.order_payments WHERE id=p_payment AND order_id=p_order AND tenant_id=p_tenant;
 IF NOT FOUND THEN RAISE EXCEPTION '支払記録が見つかりません'; END IF;
 IF pay.voided_at IS NOT NULL THEN RETURN; END IF;
 IF o.updated_at IS DISTINCT FROM p_expected_updated_at OR p_expected_updated_at IS NULL THEN RAISE EXCEPTION '注文が更新されました。再読み込みしてください'; END IF;
 SELECT prior_status INTO restore_status FROM public.order_payments WHERE order_id=p_order AND voided_at IS NULL ORDER BY created_at DESC LIMIT 1;
 UPDATE public.order_payments SET voided_at=clock_timestamp(),voided_by=auth.uid(),void_reason=trim(p_reason) WHERE id=p_payment;
 SELECT coalesce(sum(amount),0),coalesce(sum(amount) FILTER(WHERE p.method='bank_transfer'),0),count(*) FILTER(WHERE p.method='bank_transfer'),max(paid_on),
 CASE WHEN count(DISTINCT p.method)>1 THEN 'mixed' ELSE min(p.method) END
 INTO n,bank,bank_n,last_date,method FROM public.order_payments p WHERE order_id=p_order AND voided_at IS NULL;
 UPDATE public.orders SET paid_amount=n,bank_paid_amount=bank,bank_payment_count=bank_n,payment_method=method,payment_date=last_date,
 status=CASE WHEN o.status='振込済' THEN restore_status ELSE o.status END,paid_at=NULL,payment_checked=false,updated_at=clock_timestamp() WHERE id=p_order;
 INSERT INTO public.security_audit_events(tenant_id,actor_id,action,record_id,details) VALUES(p_tenant,auth.uid(),'payment_voided',p_order,jsonb_build_object('payment_id',p_payment,'amount',pay.amount,'reason',trim(p_reason)));
END $$;
REVOKE ALL ON FUNCTION public.void_order_payment(uuid,uuid,uuid,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.void_order_payment(uuid,uuid,uuid,text,timestamptz) TO authenticated,service_role;
COMMIT;
