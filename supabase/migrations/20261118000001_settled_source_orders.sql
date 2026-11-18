-- 振り分け元の明細を保存し、実支払いを重複計上せず閉じる。
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS settlement_order_numbers text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS settled_at timestamptz;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status IN (
 '承認待ち','申込','発送済','到着','検品中','検品完了','振込済','振込確認済','キャンセル','精算済'
));
CREATE OR REPLACE FUNCTION public.guard_settled_source_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target text;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.status='精算済' OR EXISTS(SELECT 1 FROM public.orders s WHERE s.tenant_id=OLD.tenant_id AND s.status='精算済' AND OLD.order_number=ANY(s.settlement_order_numbers)) THEN
   RAISE EXCEPTION '精算元・精算先の注文は削除できません';
  END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status='精算済' OR cardinality(NEW.settlement_order_numbers)>0 OR NEW.settled_at IS NOT NULL THEN
   RAISE EXCEPTION '精算済みは既存の振り分け元のみに設定できます';
  END IF;
  RETURN NEW;
 END IF;
 IF (NEW.status NOT IN ('振込済','振込確認済') OR (NEW.tenant_id,NEW.order_number) IS DISTINCT FROM (OLD.tenant_id,OLD.order_number))
    AND EXISTS(SELECT 1 FROM public.orders s WHERE s.tenant_id=OLD.tenant_id AND s.status='精算済' AND OLD.order_number=ANY(s.settlement_order_numbers)) THEN
  RAISE EXCEPTION '精算先の支払状態・注文番号は精算元を確認してから変更してください';
 END IF;
 IF (NEW.status='精算済' OR OLD.status='精算済') AND
    ((NEW.status,NEW.settlement_order_numbers,NEW.settled_at) IS DISTINCT FROM
     (OLD.status,OLD.settlement_order_numbers,OLD.settled_at)) THEN
  -- 通常のステータス変更からは設定・解除できない。確認済みの管理作業専用。
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION '精算先の照合済み管理処理が必要です'; END IF;
 END IF;
 IF NEW.status='精算済' THEN
  IF OLD.status NOT IN ('承認待ち','申込','発送済','到着','検品中','検品完了','精算済') OR
     NEW.paid_amount<>0 OR NEW.bank_paid_amount<>0 OR NEW.bank_payment_count<>0 OR
     NEW.payment_method IS NOT NULL OR NEW.payment_date IS NOT NULL OR NEW.paid_at IS NOT NULL OR
     EXISTS(SELECT 1 FROM public.order_payments p WHERE p.order_id=NEW.id) THEN
   RAISE EXCEPTION '支払記録のある注文は振り分け元として精算できません';
  END IF;
  IF (NEW.tenant_id,NEW.id,NEW.total_amount,NEW.inspected_total_amount,NEW.inspection_discount)
     IS DISTINCT FROM (OLD.tenant_id,OLD.id,OLD.total_amount,OLD.inspected_total_amount,OLD.inspection_discount) THEN
   RAISE EXCEPTION '精算元の金額・テナントは変更できません';
  END IF;
  IF NEW.payment_checked OR NEW.settled_at IS NULL OR NEW.settled_at>now() OR
     cardinality(NEW.settlement_order_numbers)<1 OR cardinality(NEW.settlement_order_numbers)>50 OR
     cardinality(NEW.settlement_order_numbers)<>(SELECT count(DISTINCT n) FROM unnest(NEW.settlement_order_numbers) n) THEN
   RAISE EXCEPTION '精算先・精算日時・振込選択を確認してください';
  END IF;
  FOREACH target IN ARRAY NEW.settlement_order_numbers LOOP
   IF NOT EXISTS(SELECT 1 FROM public.orders o WHERE o.tenant_id=NEW.tenant_id AND o.order_number=target
     AND o.id<>NEW.id AND o.status IN ('振込済','振込確認済')) THEN
    RAISE EXCEPTION '同一テナントの支払済み注文を精算先に指定してください';
   END IF;
  END LOOP;
 ELSE
  IF cardinality(NEW.settlement_order_numbers)>0 OR NEW.settled_at IS NOT NULL THEN
   RAISE EXCEPTION '精算先情報は精算済み注文にのみ設定できます';
  END IF;
 END IF;
 IF (NEW.status,NEW.settlement_order_numbers,NEW.settled_at) IS DISTINCT FROM
    (OLD.status,OLD.settlement_order_numbers,OLD.settled_at) AND (NEW.status='精算済' OR OLD.status='精算済') THEN
  INSERT INTO public.security_audit_events(tenant_id,actor_id,action,record_id,details)
  VALUES(NEW.tenant_id,auth.uid(),'source_order_settled',NEW.id,jsonb_build_object(
    'old_status',OLD.status,'new_status',NEW.status,'targets',NEW.settlement_order_numbers,'amount',NEW.total_amount));
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_settled_source_order() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_guard_settled_source_order ON public.orders;
CREATE TRIGGER trg_guard_settled_source_order BEFORE INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.guard_settled_source_order();
