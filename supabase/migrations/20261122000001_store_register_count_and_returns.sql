-- 店舗 POS: レジ締めの金種入力・回収額と翌日の釣銭準備金・釣銭追加の内訳、販売の商品ごとの返品。
-- 通販（channel = 'online'）の動作は変えない。products には触らない。
-- docs/pos/design.md 3.2 節、3.3 節。

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. レジ締め: 金種ごとの枚数、精算で回収した額、翌日に残した額
--    金種は {"pieces": {"10000": 3, "500": 12}, "rolls": {"500": 1}} の形。
--    pieces はバラの枚数、rolls は棒金（50 枚巻き）の本数。合計 = Σ 額面 ×（バラ + 本数 × 50）
-- ---------------------------------------------------------------------------
ALTER TABLE public.register_sessions ADD COLUMN IF NOT EXISTS counted_denominations jsonb;
ALTER TABLE public.register_sessions ADD COLUMN IF NOT EXISTS withdrawn_amount integer;
ALTER TABLE public.register_sessions ADD COLUMN IF NOT EXISTS carry_over_float integer;

ALTER TABLE public.register_sessions DROP CONSTRAINT IF EXISTS register_sessions_withdrawn_check;
ALTER TABLE public.register_sessions ADD CONSTRAINT register_sessions_withdrawn_check
  CHECK (withdrawn_amount IS NULL OR withdrawn_amount >= 0);
ALTER TABLE public.register_sessions DROP CONSTRAINT IF EXISTS register_sessions_carry_over_check;
ALTER TABLE public.register_sessions ADD CONSTRAINT register_sessions_carry_over_check
  CHECK (carry_over_float IS NULL OR carry_over_float >= 0);
-- 回収額と翌日に残す額は、両方そろって記録し、足すと数えた現金になる
ALTER TABLE public.register_sessions DROP CONSTRAINT IF EXISTS register_sessions_split_check;
ALTER TABLE public.register_sessions ADD CONSTRAINT register_sessions_split_check
  CHECK (
    (withdrawn_amount IS NULL AND carry_over_float IS NULL)
    OR (withdrawn_amount IS NOT NULL AND carry_over_float IS NOT NULL AND counted_cash IS NOT NULL
        AND withdrawn_amount + carry_over_float = counted_cash)
  );

COMMENT ON COLUMN public.register_sessions.counted_denominations IS '締めで数えた金種。{"pieces": {額面: バラの枚数}, "rolls": {額面: 棒金の本数}}';
COMMENT ON COLUMN public.register_sessions.withdrawn_amount IS '締めでレジから回収した額（売上金として金庫・銀行へ）';
COMMENT ON COLUMN public.register_sessions.carry_over_float IS '締めでレジに残した額。翌日の釣銭準備金の初期値になる';

-- ---------------------------------------------------------------------------
-- 2. 入出金: 種類（釣銭の追加・経費・売上金の回収など）と、追加した棒金・札の内訳
-- ---------------------------------------------------------------------------
ALTER TABLE public.cash_movements ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.cash_movements ADD COLUMN IF NOT EXISTS denominations jsonb;
ALTER TABLE public.cash_movements DROP CONSTRAINT IF EXISTS cash_movements_category_check;
ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_category_check
  CHECK (category IS NULL OR category IN ('change', 'other_in', 'expense', 'pickup', 'other_out'));

COMMENT ON COLUMN public.cash_movements.category IS 'change: 釣銭の追加 / other_in: その他の入金 / expense: 経費 / pickup: 売上金の回収 / other_out: その他の出金';
COMMENT ON COLUMN public.cash_movements.denominations IS '追加・回収した金種の内訳（任意）。register_sessions.counted_denominations と同じ形';

-- ---------------------------------------------------------------------------
-- 3. 販売の返品（商品ごと）
--    sale_items.returned_quantity: その明細のうち返品済みの数量
--    sales.refunded_total: その販売で返金した合計
--    sale_returns: 返品 1 回ごとの記録。返金はそのとき開いていたレジの現金から出る
--    すべての明細が返品済みになった販売は、これまでどおり取消（voided_at）として扱う
-- ---------------------------------------------------------------------------
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS returned_quantity integer NOT NULL DEFAULT 0;
ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS sale_items_returned_check;
ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_returned_check
  CHECK (returned_quantity >= 0 AND returned_quantity <= quantity);

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS refunded_total integer NOT NULL DEFAULT 0;
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_refunded_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_refunded_check
  CHECK (refunded_total >= 0 AND refunded_total <= total);

CREATE TABLE IF NOT EXISTS public.sale_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  -- 返金したときに開いていたレジ
  register_session_id uuid NOT NULL REFERENCES public.register_sessions(id),
  amount integer NOT NULL CONSTRAINT sale_returns_amount_check CHECK (amount >= 0),
  reason text NOT NULL,
  -- [{"sale_item_id": "...", "name": "...", "quantity": 1, "unit_price": 1200}]
  lines jsonb NOT NULL,
  returned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  returned_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sale_returns_sale_idx ON public.sale_returns(sale_id, created_at);
CREATE INDEX IF NOT EXISTS sale_returns_session_idx ON public.sale_returns(register_session_id);
CREATE INDEX IF NOT EXISTS sale_returns_tenant_created_idx ON public.sale_returns(tenant_id, created_at DESC);

ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sale_returns FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sale_returns TO authenticated;
GRANT ALL ON public.sale_returns TO service_role;
DROP POLICY IF EXISTS sale_returns_select_tenant ON public.sale_returns;
CREATE POLICY sale_returns_select_tenant ON public.sale_returns FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN ('admin','manager','staff'));

COMMENT ON TABLE public.sale_returns IS '販売の返品（1 回ごと）。商品ごとに数量を選べる。返金は開局中のレジの現金から出る';

-- これまでの取消（全額）を返品の記録に写す。すでに写してある販売は飛ばす
UPDATE public.sale_items si SET returned_quantity = si.quantity
  FROM public.sales s
  WHERE s.id = si.sale_id AND s.voided_at IS NOT NULL AND si.returned_quantity <> si.quantity;
INSERT INTO public.sale_returns (tenant_id, sale_id, register_session_id, amount, reason, lines, returned_by, returned_by_name, created_at)
  SELECT s.tenant_id, s.id, s.void_register_session_id, s.total, s.void_reason,
         COALESCE((SELECT jsonb_agg(jsonb_build_object('sale_item_id', si.id, 'name', si.name, 'quantity', si.quantity, 'unit_price', si.unit_price) ORDER BY si.created_at)
                     FROM public.sale_items si WHERE si.sale_id = s.id), '[]'::jsonb),
         s.voided_by, s.voided_by_name, s.voided_at
    FROM public.sales s
    WHERE s.voided_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.sale_returns r WHERE r.sale_id = s.id);
UPDATE public.sales SET refunded_total = total WHERE voided_at IS NOT NULL AND refunded_total <> total;

-- ---------------------------------------------------------------------------
-- 4. 返品の関数
-- p_lines: [{"sale_item_id": "...", "quantity": 1}]。NULL なら残っている明細をすべて返品する（＝取消）
-- 戻り値: {"refunded": 返金額, "fully_returned": すべて返品済みになったか}
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_return_sale_items(
  p_tenant uuid, p_sale uuid, p_lines jsonb, p_reason text, p_user uuid, p_user_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_session uuid;
  v_item public.sale_items%ROWTYPE;
  v_line jsonb;
  v_qty integer;
  v_refund bigint := 0;
  v_done jsonb := '[]'::jsonb;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_fully boolean;
BEGIN
  IF coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION '返品・取消の理由を入力してください' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '販売が見つかりません' USING ERRCODE = 'P0001'; END IF;
  IF v_sale.voided_at IS NOT NULL THEN RAISE EXCEPTION 'この販売は取消済みです' USING ERRCODE = 'P0001'; END IF;
  SELECT id INTO v_session FROM public.register_sessions WHERE tenant_id = p_tenant AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1;
  IF v_session IS NULL THEN RAISE EXCEPTION 'レジが開局されていません。レジ画面で開局してから返品・取消をしてください' USING ERRCODE = 'P0001'; END IF;

  IF p_lines IS NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('sale_item_id', id, 'quantity', quantity - returned_quantity)), '[]'::jsonb)
      INTO p_lines FROM public.sale_items WHERE sale_id = p_sale AND quantity > returned_quantity;
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION '返品する商品を選んでください' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_array_length(p_lines) > 200 THEN RAISE EXCEPTION '明細が多すぎます' USING ERRCODE = 'P0001'; END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_qty := (v_line->>'quantity')::integer;
    SELECT * INTO v_item FROM public.sale_items
      WHERE id = (v_line->>'sale_item_id')::uuid AND sale_id = p_sale AND tenant_id = p_tenant FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION '返品する明細が見つかりません' USING ERRCODE = 'P0001'; END IF;
    IF v_item.id = ANY (v_seen) THEN RAISE EXCEPTION '同じ明細が 2 回指定されています' USING ERRCODE = 'P0001'; END IF;
    v_seen := v_seen || v_item.id;
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > v_item.quantity - v_item.returned_quantity THEN
      RAISE EXCEPTION '「%」の返品数が正しくありません（返品できるのは % 点まで）', v_item.name, v_item.quantity - v_item.returned_quantity USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.sale_items SET returned_quantity = returned_quantity + v_qty WHERE id = v_item.id;
    IF v_item.inventory_item_id IS NOT NULL THEN
      UPDATE public.inventory_items SET quantity = quantity + v_qty, status = 'in_stock'
        WHERE id = v_item.inventory_item_id AND tenant_id = p_tenant;
      INSERT INTO public.inventory_movements (tenant_id, inventory_item_id, kind, quantity, sale_id, reason, created_by, created_by_name)
        VALUES (p_tenant, v_item.inventory_item_id, 'return', v_qty, p_sale, btrim(p_reason), p_user, p_user_name);
    ELSE
      UPDATE public.price_bands SET stock_quantity = stock_quantity + v_qty WHERE id = v_item.price_band_id AND tenant_id = p_tenant;
      INSERT INTO public.inventory_movements (tenant_id, price_band_id, kind, quantity, sale_id, reason, created_by, created_by_name)
        VALUES (p_tenant, v_item.price_band_id, 'return', v_qty, p_sale, btrim(p_reason), p_user, p_user_name);
    END IF;
    v_refund := v_refund + v_item.unit_price::bigint * v_qty;
    v_done := v_done || jsonb_build_object('sale_item_id', v_item.id, 'name', v_item.name, 'quantity', v_qty, 'unit_price', v_item.unit_price);
  END LOOP;

  INSERT INTO public.sale_returns (tenant_id, sale_id, register_session_id, amount, reason, lines, returned_by, returned_by_name)
    VALUES (p_tenant, p_sale, v_session, v_refund::integer, btrim(p_reason), v_done, p_user, p_user_name);

  v_fully := NOT EXISTS (SELECT 1 FROM public.sale_items WHERE sale_id = p_sale AND quantity > returned_quantity);
  UPDATE public.sales
    SET refunded_total = refunded_total + v_refund::integer,
        voided_at = CASE WHEN v_fully THEN now() ELSE voided_at END,
        voided_by = CASE WHEN v_fully THEN p_user ELSE voided_by END,
        voided_by_name = CASE WHEN v_fully THEN p_user_name ELSE voided_by_name END,
        void_reason = CASE WHEN v_fully THEN btrim(p_reason) ELSE void_reason END,
        void_register_session_id = CASE WHEN v_fully THEN v_session ELSE void_register_session_id END
    WHERE id = p_sale;
  RETURN jsonb_build_object('refunded', v_refund::integer, 'fully_returned', v_fully);
END;
$$;

-- 取消（残りをすべて返品）。これまでの呼び出し方を残す
CREATE OR REPLACE FUNCTION public.store_void_sale(
  p_tenant uuid, p_sale uuid, p_reason text, p_user uuid, p_user_name text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN (public.store_return_sale_items(p_tenant, p_sale, NULL, p_reason, p_user, p_user_name)->>'refunded')::integer;
END;
$$;

REVOKE ALL ON FUNCTION public.store_return_sale_items(uuid, uuid, jsonb, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_return_sale_items(uuid, uuid, jsonb, text, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.store_void_sale(uuid, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_void_sale(uuid, uuid, text, uuid, text) TO service_role;

COMMENT ON TABLE public.sales IS '店頭販売。税込・10% 内税。返品は商品ごとにでき、すべて返品すると取消になる';

COMMIT;
