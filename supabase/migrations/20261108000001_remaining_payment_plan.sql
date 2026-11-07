BEGIN;
-- 現金一部払いのあと、残額を銀行振込で受け取れるようにする。
-- 振込の可否は「支払予定」だけで決める（bank_transfer のときだけ振込対象）。現金の支払履歴があるだけでは振込を止めない。
-- 振込額は常に残額（買取合計 − 記録済み支払額）なので、現金で渡した分が振り込まれることはない。
-- 現金を一部記録するときは、残りの扱い（銀行振込・現金・未定）を必ず選ばせ、支払予定に保存する。未定は振込対象外のまま。
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_planned_payment_method_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_planned_payment_method_check CHECK (planned_payment_method IN ('bank_transfer','cash','undecided'));

CREATE OR REPLACE FUNCTION public.guard_planned_payment_method() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE changed boolean;
BEGIN
 changed := CASE WHEN TG_OP='INSERT' THEN NEW.planned_payment_method<>'bank_transfer' ELSE (NEW.planned_payment_method,NEW.planned_payment_note) IS DISTINCT FROM (OLD.planned_payment_method,OLD.planned_payment_note) END;
 IF changed THEN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (public.get_user_role(auth.uid()) IS NULL OR public.get_user_role(auth.uid()) NOT IN ('admin','manager') OR public.get_user_tenant_id(auth.uid()) IS DISTINCT FROM NEW.tenant_id OR auth.jwt()->>'aal' IS DISTINCT FROM 'aal2') THEN
   RAISE EXCEPTION '支払予定の変更は管理者・責任者の二段階認証が必要です';
  END IF;
  IF length(btrim(coalesce(NEW.planned_payment_note,'')))<1 OR length(NEW.planned_payment_note)>500 THEN RAISE EXCEPTION '支払予定を変更する理由を入力してください'; END IF;
  NEW.payment_checked:=false;
  INSERT INTO public.security_audit_events(tenant_id,actor_id,action,record_id,details) VALUES(NEW.tenant_id,auth.uid(),'planned_payment_changed',NEW.id,jsonb_build_object('method',NEW.planned_payment_method,'reason',NEW.planned_payment_note));
 END IF;
 IF NEW.payment_checked AND NEW.planned_payment_method<>'bank_transfer' THEN RAISE EXCEPTION '支払予定が銀行振込ではない注文は振込対象に選択できません'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.block_bank_payment_for_cash_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.orders;
BEGIN
 IF NEW.method='bank_transfer' THEN
  SELECT * INTO o FROM public.orders WHERE id=NEW.order_id AND tenant_id=NEW.tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '注文が見つかりません'; END IF;
  IF o.planned_payment_method<>'bank_transfer' THEN RAISE EXCEPTION '支払予定が現金・未定の注文には銀行振込を登録できません。先に支払予定を銀行振込に変更してください'; END IF;
 END IF;
 RETURN NEW;
END $$;

DROP FUNCTION IF EXISTS public.record_order_payment(uuid,uuid,text,bigint,date,uuid,timestamptz,boolean);
CREATE FUNCTION public.record_order_payment(p_tenant uuid,p_order uuid,p_method text,p_amount bigint,p_paid_on date,p_request uuid,p_expected_updated_at timestamptz,p_require_full boolean DEFAULT false,p_remaining_plan text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.orders; existing public.order_payments; n bigint; bank bigint; bank_n integer; last_date date; method text; due bigint; remaining bigint; plan text; plan_note text;
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
 remaining:=due-o.paid_amount;
 IF p_require_full AND (o.status<>'検品完了' OR p_amount<>remaining) THEN RAISE EXCEPTION '残額が変更されています。再読み込みして振込額を確認してください'; END IF;
 IF p_amount>remaining THEN RAISE EXCEPTION '支払額が残額を超えています'; END IF;
 IF p_amount=remaining AND o.status<>'検品完了' THEN RAISE EXCEPTION '全額の支払完了は検品完了後に登録してください'; END IF;
 -- 現金の一部払いは、残りの扱いを必ず決める（振込に載せる判断を意識的に行わせる）。全額払いなら残りがないので不要。
 plan:=NULL; plan_note:=o.planned_payment_note;
 IF p_method='cash' AND p_amount<remaining THEN
  IF p_remaining_plan IS NULL OR p_remaining_plan NOT IN ('bank_transfer','cash','undecided') THEN RAISE EXCEPTION '残りの支払方法（銀行振込・現金・未定）を選んでください'; END IF;
  IF p_remaining_plan IS DISTINCT FROM o.planned_payment_method THEN
   plan:=p_remaining_plan;
   plan_note:=format('現金 %s 円の一部払い時に選択: 残り %s 円は%s',p_amount,remaining-p_amount,CASE p_remaining_plan WHEN 'bank_transfer' THEN '銀行振込' WHEN 'cash' THEN '後日現金' ELSE '未定' END);
  END IF;
 END IF;
 INSERT INTO public.order_payments(id,tenant_id,order_id,method,amount,paid_on,prior_status,created_by)
 VALUES(p_request,p_tenant,p_order,p_method,p_amount,p_paid_on,o.status,auth.uid());
 SELECT sum(amount),coalesce(sum(amount) FILTER(WHERE p.method='bank_transfer'),0),count(*) FILTER(WHERE p.method='bank_transfer'),max(paid_on),
 CASE WHEN count(DISTINCT p.method)>1 THEN 'mixed' ELSE min(p.method) END
 INTO n,bank,bank_n,last_date,method FROM public.order_payments p WHERE order_id=p_order AND voided_at IS NULL;
 UPDATE public.orders SET paid_amount=n,bank_paid_amount=bank,bank_payment_count=bank_n,payment_method=method,payment_date=last_date,
 status=CASE WHEN n=due THEN '振込済' ELSE o.status END,paid_at=CASE WHEN n=due THEN last_date::timestamp AT TIME ZONE 'Asia/Tokyo' ELSE NULL END,
 planned_payment_method=coalesce(plan,o.planned_payment_method),planned_payment_note=plan_note,
 payment_checked=false,updated_at=clock_timestamp() WHERE id=p_order;
 INSERT INTO public.security_audit_events(tenant_id,actor_id,action,record_id,details) VALUES(p_tenant,auth.uid(),'payment_recorded',p_order,jsonb_build_object('payment_id',p_request,'method',p_method,'amount',p_amount,'paid_on',p_paid_on,'remaining_plan',p_remaining_plan));
 RETURN p_request;
END $$;
REVOKE ALL ON FUNCTION public.record_order_payment(uuid,uuid,text,bigint,date,uuid,timestamptz,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_order_payment(uuid,uuid,text,bigint,date,uuid,timestamptz,boolean,text) TO authenticated,service_role;
COMMIT;
