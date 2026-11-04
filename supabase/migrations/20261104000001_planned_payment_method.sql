BEGIN;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS planned_payment_method text NOT NULL DEFAULT 'bank_transfer' CHECK (planned_payment_method IN ('bank_transfer','cash'));
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS planned_payment_note text;

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
  IF NEW.planned_payment_method='bank_transfer' AND NEW.payment_method IN ('cash','mixed') THEN RAISE EXCEPTION '現金支払履歴のある注文は振込対象に戻せません'; END IF;
  NEW.payment_checked:=false;
  INSERT INTO public.security_audit_events(tenant_id,actor_id,action,record_id,details) VALUES(NEW.tenant_id,auth.uid(),'planned_payment_changed',NEW.id,jsonb_build_object('method',NEW.planned_payment_method,'reason',NEW.planned_payment_note));
 END IF;
 IF NEW.payment_checked AND (NEW.planned_payment_method='cash' OR NEW.payment_method IN ('cash','mixed')) THEN RAISE EXCEPTION '現金予定・現金払いは振込対象に選択できません'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_planned_payment_method ON public.orders;
CREATE TRIGGER trg_planned_payment_method BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_planned_payment_method();

CREATE OR REPLACE FUNCTION public.block_bank_payment_for_cash_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.orders;
BEGIN
 IF NEW.method='bank_transfer' THEN
  SELECT * INTO o FROM public.orders WHERE id=NEW.order_id AND tenant_id=NEW.tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '注文が見つかりません'; END IF;
  IF o.planned_payment_method='cash' OR o.payment_method IN ('cash','mixed') THEN RAISE EXCEPTION '現金予定・現金払いの注文には銀行振込を登録できません'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_block_bank_for_cash ON public.order_payments;
CREATE TRIGGER trg_block_bank_for_cash BEFORE INSERT ON public.order_payments FOR EACH ROW EXECUTE FUNCTION public.block_bank_payment_for_cash_order();
COMMIT;
