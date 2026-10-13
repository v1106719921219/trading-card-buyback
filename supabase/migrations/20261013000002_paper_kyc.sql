BEGIN;
-- Paper verification is order-specific and never masquerades as reusable eKYC.
CREATE TABLE public.order_paper_kyc (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
 document_type text NOT NULL DEFAULT 'residence_certificate' CHECK(document_type='residence_certificate'),
 received_on date NOT NULL,
 storage_reference text NOT NULL CHECK(length(trim(storage_reference)) BETWEEN 1 AND 300),
 verified_by uuid NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 order_snapshot jsonb NOT NULL,
 revoked_at timestamptz,
 revoked_by uuid,
 revoke_reason text
);
CREATE UNIQUE INDEX order_paper_kyc_active ON public.order_paper_kyc(order_id) WHERE revoked_at IS NULL;
ALTER TABLE public.order_paper_kyc ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_paper_kyc FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.order_paper_kyc TO authenticated,service_role;
CREATE POLICY paper_kyc_read ON public.order_paper_kyc FOR SELECT TO authenticated USING (
 tenant_id=public.get_user_tenant_id(auth.uid()) AND
 (public.get_user_role(auth.uid())='staff' OR (public.get_user_role(auth.uid()) IN ('admin','manager') AND auth.jwt()->>'aal'='aal2'))
);

CREATE FUNCTION public.paper_kyc_snapshot(o public.orders) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('customer_name',o.customer_name,'customer_birth_date',o.customer_birth_date,
 'customer_occupation',o.customer_occupation,'customer_prefecture',o.customer_prefecture,'customer_address',o.customer_address,
 'bank_name',o.bank_name,'bank_branch',o.bank_branch,'bank_account_type',o.bank_account_type,
 'bank_account_number',o.bank_account_number,'bank_account_holder',o.bank_account_holder)
$$;
REVOKE ALL ON FUNCTION public.paper_kyc_snapshot(public.orders) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.approve_order_paper_kyc(p_tenant uuid,p_order uuid,p_received_on date,p_storage_reference text,
 p_document_received boolean,p_identity_matched boolean,p_bank_matched boolean,p_expected_updated_at timestamptz) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.orders; existing public.order_paper_kyc; result uuid; snap jsonb;
BEGIN
 IF public.get_user_role(auth.uid()) IS NULL OR public.get_user_role(auth.uid()) NOT IN ('admin','manager')
 OR public.get_user_tenant_id(auth.uid()) IS DISTINCT FROM p_tenant OR auth.jwt()->>'aal' IS DISTINCT FROM 'aal2'
 THEN RAISE EXCEPTION '紙の本人確認承認は管理者・マネージャーの二段階認証が必要です'; END IF;
 IF p_document_received IS DISTINCT FROM true OR p_identity_matched IS DISTINCT FROM true OR p_bank_matched IS DISTINCT FROM true
 THEN RAISE EXCEPTION '書類受領・本人情報・本人名義口座の照合が必要です'; END IF;
 IF p_received_on IS NULL OR p_received_on>(now() AT TIME ZONE 'Asia/Tokyo')::date
 OR p_storage_reference IS NULL OR length(trim(p_storage_reference)) NOT BETWEEN 1 AND 300
 THEN RAISE EXCEPTION '書類の受領日と保管場所を確認してください'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order AND tenant_id=p_tenant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '注文が見つかりません'; END IF;
 SELECT * INTO existing FROM public.order_paper_kyc WHERE order_id=p_order AND revoked_at IS NULL;
 IF FOUND THEN
  IF existing.received_on=p_received_on AND existing.storage_reference=trim(p_storage_reference) THEN RETURN existing.id; END IF;
  RAISE EXCEPTION '承認済みです。内容を変更する場合は管理者が承認を取り消してください';
 END IF;
 IF p_expected_updated_at IS NULL OR o.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION '注文が更新されました。再読み込みして照合してください'; END IF;
 IF o.status NOT IN ('申込','承認待ち','発送済','検品完了') OR o.paid_amount>0 OR EXISTS(SELECT 1 FROM public.order_payments WHERE order_id=p_order AND voided_at IS NULL)
 THEN RAISE EXCEPTION '支払い済み・取消済みの注文は紙の確認に変更できません'; END IF;
 IF o.identity_verified_at IS NOT NULL THEN RAISE EXCEPTION '既に本人確認済みです'; END IF;
 snap:=public.paper_kyc_snapshot(o);
 IF EXISTS(SELECT 1 FROM jsonb_each_text(snap) v WHERE v.value IS NULL OR length(trim(v.value))=0)
 THEN RAISE EXCEPTION '氏名・住所・生年月日・職業・振込先を登録してから照合してください'; END IF;
 INSERT INTO public.order_paper_kyc(tenant_id,order_id,received_on,storage_reference,verified_by,order_snapshot)
 VALUES(p_tenant,p_order,p_received_on,trim(p_storage_reference),auth.uid(),snap) RETURNING id INTO result;
 UPDATE public.orders SET kyc_deferred=true,kyc_request_id=NULL,identity_verified_at=clock_timestamp(),
 customer_identity_method='紙確認済み（住民票・本人名義振込限定）',updated_at=clock_timestamp() WHERE id=p_order;
 INSERT INTO public.security_audit_events(tenant_id,actor_id,action,record_id,details)
 VALUES(p_tenant,auth.uid(),'paper_kyc_approved',p_order,jsonb_build_object('paper_kyc_id',result,'document_type','residence_certificate','received_on',p_received_on));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.approve_order_paper_kyc(uuid,uuid,date,text,boolean,boolean,boolean,timestamptz) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.approve_order_paper_kyc(uuid,uuid,date,text,boolean,boolean,boolean,timestamptz) TO authenticated;

CREATE FUNCTION public.revoke_order_paper_kyc(p_tenant uuid,p_order uuid,p_reason text,p_expected_updated_at timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.orders; paper_id uuid;
BEGIN
 IF public.get_user_role(auth.uid()) IS DISTINCT FROM 'admin' OR public.get_user_tenant_id(auth.uid()) IS DISTINCT FROM p_tenant
 OR auth.jwt()->>'aal' IS DISTINCT FROM 'aal2' THEN RAISE EXCEPTION '承認取消は管理者の二段階認証が必要です'; END IF;
 IF p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION '取消理由を入力してください'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order AND tenant_id=p_tenant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '注文が見つかりません'; END IF;
 IF p_expected_updated_at IS NULL OR o.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION '注文が更新されました。再読み込みしてください'; END IF;
 IF o.paid_amount>0 OR o.status IN ('振込済','振込確認済') OR EXISTS(SELECT 1 FROM public.order_payments WHERE order_id=p_order AND voided_at IS NULL)
 THEN RAISE EXCEPTION '支払記録があるため承認を取り消せません。先に支払い状況を確認してください'; END IF;
 UPDATE public.order_paper_kyc SET revoked_at=clock_timestamp(),revoked_by=auth.uid(),revoke_reason=trim(p_reason)
 WHERE order_id=p_order AND tenant_id=p_tenant AND revoked_at IS NULL RETURNING id INTO paper_id;
 IF paper_id IS NULL THEN RAISE EXCEPTION '有効な紙の本人確認承認がありません'; END IF;
 UPDATE public.orders SET identity_verified_at=NULL,kyc_request_id=NULL,customer_identity_method='本人確認待ち',updated_at=clock_timestamp() WHERE id=p_order;
 INSERT INTO public.security_audit_events(tenant_id,actor_id,action,record_id,details)
 VALUES(p_tenant,auth.uid(),'paper_kyc_revoked',p_order,jsonb_build_object('paper_kyc_id',paper_id,'reason',trim(p_reason)));
END $$;
REVOKE ALL ON FUNCTION public.revoke_order_paper_kyc(uuid,uuid,text,timestamptz) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.revoke_order_paper_kyc(uuid,uuid,text,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_deferred_order_kyc() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE paper public.order_paper_kyc; has_paper boolean;
BEGIN
 IF TG_OP='UPDATE' AND OLD.kyc_deferred AND NOT NEW.kyc_deferred THEN RAISE EXCEPTION '本人確認待ちの受付履歴は解除できません'; END IF;
 SELECT * INTO paper FROM public.order_paper_kyc WHERE order_id=NEW.id AND revoked_at IS NULL;
 has_paper:=FOUND;
 IF has_paper THEN
  IF paper.tenant_id IS DISTINCT FROM NEW.tenant_id OR paper.order_snapshot IS DISTINCT FROM public.paper_kyc_snapshot(NEW)
  THEN RAISE EXCEPTION '紙の本人確認後は本人情報・振込先を変更できません。管理者が承認を取り消して再確認してください'; END IF;
  IF NEW.payment_method IN ('cash','mixed') THEN RAISE EXCEPTION '紙の本人確認は本人名義口座への銀行振込限定です'; END IF;
  IF (NEW.status IN ('振込済','振込確認済') OR NEW.paid_amount>0) AND (NEW.payment_method IS DISTINCT FROM 'bank_transfer' OR NEW.identity_verified_at IS NULL)
  THEN RAISE EXCEPTION '紙の本人確認承認と本人名義口座への銀行振込が必要です'; END IF;
 END IF;
 IF NEW.kyc_deferred AND (NEW.status IN ('振込済','振込確認済') OR NEW.paid_amount>0) THEN
  IF NEW.identity_verified_at IS NULL OR (NOT has_paper AND NOT EXISTS (
   SELECT 1 FROM public.kyc_requests k WHERE k.id=NEW.kyc_request_id AND k.tenant_id=NEW.tenant_id AND k.status='approved'
  )) THEN RAISE EXCEPTION '本人確認待ちです。承認完了まで支払いできません'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_deferred_kyc_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.orders; paper public.order_paper_kyc; has_paper boolean;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=NEW.order_id AND tenant_id=NEW.tenant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
 SELECT * INTO paper FROM public.order_paper_kyc WHERE order_id=o.id AND tenant_id=o.tenant_id AND revoked_at IS NULL;
 has_paper:=FOUND;
 IF NEW.voided_at IS NULL THEN
  IF has_paper AND (NEW.method IS DISTINCT FROM 'bank_transfer' OR paper.order_snapshot IS DISTINCT FROM public.paper_kyc_snapshot(o) OR o.identity_verified_at IS NULL)
  THEN RAISE EXCEPTION '紙の本人確認は確認済みの本人名義口座への銀行振込限定です'; END IF;
  IF o.kyc_deferred AND (o.identity_verified_at IS NULL OR (NOT has_paper AND NOT EXISTS (
   SELECT 1 FROM public.kyc_requests k WHERE k.id=o.kyc_request_id AND k.tenant_id=o.tenant_id AND k.status='approved'
  ))) THEN RAISE EXCEPTION '本人確認待ちです。承認完了まで支払いできません'; END IF;
 END IF;
 RETURN NEW;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
