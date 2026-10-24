BEGIN;
-- 紙の本人確認を住民票以外（免許証などのコピー）にも広げる（2026-10-24 社長判断）。
-- コピーの場合は、受領した書類の画像（order_paper_kyc_documents）が1枚以上保存されていることを承認の条件にする。
-- 承認はスタッフも行える（eKYCの承認と同じ）。管理者・マネージャーは従来どおり二段階認証済みであること。
-- 取消は従来どおり管理者のみ。振込限定・本人情報の固定といった承認後の制約は変えない。
ALTER TABLE public.order_paper_kyc DROP CONSTRAINT IF EXISTS order_paper_kyc_document_type_check;
ALTER TABLE public.order_paper_kyc ADD CONSTRAINT order_paper_kyc_document_type_check
 CHECK (document_type IN ('residence_certificate','driving_license','my_number_card','passport','health_insurance','residence_card'));

CREATE OR REPLACE FUNCTION public.paper_kyc_document_label(p_type text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT CASE p_type
  WHEN 'residence_certificate' THEN '住民票'
  WHEN 'driving_license' THEN '運転免許証コピー'
  WHEN 'my_number_card' THEN 'マイナンバーカードコピー'
  WHEN 'passport' THEN 'パスポートコピー'
  WHEN 'health_insurance' THEN '保険証コピー'
  WHEN 'residence_card' THEN '在留カードコピー'
  ELSE p_type END
$$;
REVOKE ALL ON FUNCTION public.paper_kyc_document_label(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.paper_kyc_document_label(text) TO authenticated,service_role;

-- 旧シグネチャ（書類種類なし）は廃止
DROP FUNCTION IF EXISTS public.approve_order_paper_kyc(uuid,uuid,date,text,boolean,boolean,boolean,timestamptz);

CREATE FUNCTION public.approve_order_paper_kyc(p_tenant uuid,p_order uuid,p_document_type text,p_received_on date,p_storage_reference text,
 p_document_received boolean,p_identity_matched boolean,p_bank_matched boolean,p_expected_updated_at timestamptz) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.orders; existing public.order_paper_kyc; result uuid; snap jsonb; r text; image_count integer;
BEGIN
 r:=public.get_user_role(auth.uid());
 IF r IS NULL OR public.get_user_tenant_id(auth.uid()) IS DISTINCT FROM p_tenant
 OR NOT (r='staff' OR (r IN ('admin','manager') AND auth.jwt()->>'aal'='aal2'))
 THEN RAISE EXCEPTION '紙の本人確認の承認はスタッフ、または二段階認証済みの管理者・マネージャーのみ行えます'; END IF;
 IF p_document_type IS NULL OR p_document_type NOT IN ('residence_certificate','driving_license','my_number_card','passport','health_insurance','residence_card')
 THEN RAISE EXCEPTION '書類の種類を選んでください'; END IF;
 IF p_document_received IS DISTINCT FROM true OR p_identity_matched IS DISTINCT FROM true OR p_bank_matched IS DISTINCT FROM true
 THEN RAISE EXCEPTION '書類受領・本人情報・本人名義口座の照合が必要です'; END IF;
 IF p_received_on IS NULL OR p_received_on>(now() AT TIME ZONE 'Asia/Tokyo')::date
 OR p_storage_reference IS NULL OR length(trim(p_storage_reference)) NOT BETWEEN 1 AND 300
 THEN RAISE EXCEPTION '書類の受領日と保管場所を確認してください'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order AND tenant_id=p_tenant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '注文が見つかりません'; END IF;
 SELECT * INTO existing FROM public.order_paper_kyc WHERE order_id=p_order AND revoked_at IS NULL;
 IF FOUND THEN
  IF existing.document_type=p_document_type AND existing.received_on=p_received_on AND existing.storage_reference=trim(p_storage_reference) THEN RETURN existing.id; END IF;
  RAISE EXCEPTION '承認済みです。内容を変更する場合は管理者が承認を取り消してください';
 END IF;
 IF p_expected_updated_at IS NULL OR o.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION '注文が更新されました。再読み込みして照合してください'; END IF;
 IF o.status NOT IN ('申込','承認待ち','発送済','検品完了') OR o.paid_amount>0 OR EXISTS(SELECT 1 FROM public.order_payments WHERE order_id=p_order AND voided_at IS NULL)
 THEN RAISE EXCEPTION '支払い済み・取消済みの注文は紙の確認に変更できません'; END IF;
 IF o.identity_verified_at IS NOT NULL THEN RAISE EXCEPTION '既に本人確認済みです'; END IF;
 -- コピーの場合は、受領した書類の画像が保存されていることを必須にする（住民票は原本を保管するため任意）
 IF p_document_type<>'residence_certificate' THEN
  SELECT count(*) INTO image_count FROM public.order_paper_kyc_documents WHERE order_id=p_order AND tenant_id=p_tenant;
  IF image_count=0 THEN RAISE EXCEPTION '先に「受領した書類の画像」へコピーの画像を保存してください'; END IF;
 END IF;
 snap:=public.paper_kyc_snapshot(o);
 IF EXISTS(SELECT 1 FROM jsonb_each_text(snap) v WHERE v.value IS NULL OR length(trim(v.value))=0)
 THEN RAISE EXCEPTION '氏名・住所・生年月日・職業・振込先を登録してから照合してください'; END IF;
 INSERT INTO public.order_paper_kyc(tenant_id,order_id,document_type,received_on,storage_reference,verified_by,order_snapshot)
 VALUES(p_tenant,p_order,p_document_type,p_received_on,trim(p_storage_reference),auth.uid(),snap) RETURNING id INTO result;
 -- スタッフは通常 identity_verified_at を変更できない（guard_order_sensitive_changes）。この関数内の更新だけを許可する印
 PERFORM set_config('app.paper_kyc_order',p_order::text,true);
 UPDATE public.orders SET kyc_deferred=true,kyc_request_id=NULL,identity_verified_at=clock_timestamp(),
  customer_identity_method='紙確認済み（'||public.paper_kyc_document_label(p_document_type)||'・本人名義振込限定）',updated_at=clock_timestamp() WHERE id=p_order;
 PERFORM set_config('app.paper_kyc_order','',true);
 INSERT INTO public.security_audit_events(tenant_id,actor_id,action,record_id,details)
 VALUES(p_tenant,auth.uid(),'paper_kyc_approved',p_order,jsonb_build_object('paper_kyc_id',result,'document_type',p_document_type,'received_on',p_received_on,'image_count',coalesce(image_count,0)));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.approve_order_paper_kyc(uuid,uuid,text,date,text,boolean,boolean,boolean,timestamptz) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.approve_order_paper_kyc(uuid,uuid,text,date,text,boolean,boolean,boolean,timestamptz) TO authenticated;

-- 本人確認の変更は管理者・マネージャーの二段階認証が必要だが、approve_order_paper_kyc 内の更新（同じ注文IDの印がある間）だけはスタッフでも通す
CREATE OR REPLACE FUNCTION public.guard_order_sensitive_changes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r text; t uuid; fields text[] := ARRAY[]::text[]; bank_changed boolean; identity_changed boolean; paper_rpc boolean;
BEGIN
 bank_changed := (NEW.bank_name,NEW.bank_branch,NEW.bank_account_type,NEW.bank_account_number,NEW.bank_account_holder) IS DISTINCT FROM (OLD.bank_name,OLD.bank_branch,OLD.bank_account_type,OLD.bank_account_number,OLD.bank_account_holder);
 identity_changed := (NEW.kyc_request_id,NEW.identity_verified_at) IS DISTINCT FROM (OLD.kyc_request_id,OLD.identity_verified_at);
 paper_rpc := coalesce(current_setting('app.paper_kyc_order',true),'')=OLD.id::text;
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  SELECT role,tenant_id INTO r,t FROM public.profiles WHERE id=auth.uid();
  IF t IS DISTINCT FROM OLD.tenant_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN RAISE EXCEPTION 'Tenant mismatch'; END IF;
  IF bank_changed OR (identity_changed AND NOT paper_rpc) OR NEW.paid_at IS DISTINCT FROM OLD.paid_at OR
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
NOTIFY pgrst,'reload schema';
COMMIT;
