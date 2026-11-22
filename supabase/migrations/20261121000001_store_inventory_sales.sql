-- 店舗 POS 段階 2: 在庫と販売（docs/pos/design.md 3.2 節、5.2 節、6.7 節）。
-- 通販（channel = 'online'）の動作は変えない。products には触らない。
-- 書き込みはサーバー（service_role）と下の関数だけ。スタッフは読み取りのみ（操作は必ずサーバーアクション経由）。
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 在庫（inventory_items）
-- 買取の支払い完了で「振分待ち」として自動で入る。高額品は 1 件 1 枚、まとめ買取は 1 件に枚数を持つ。
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.inventory_barcode_seq;

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  name text NOT NULL,
  model_number text,
  condition_rank text,
  psa_cert_number text,
  -- ラベル用の識別子（Code128）。価格は印字しない
  barcode text NOT NULL DEFAULT ('S' || lpad(nextval('public.inventory_barcode_seq')::text, 8, '0')),
  source text NOT NULL CONSTRAINT inventory_items_source_check CHECK (source IN ('buyback', 'opened_box', 'transfer_in', 'manual')),
  source_order_item_id uuid,
  source_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  -- 振り分けで分割したときの元の在庫
  parent_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  -- 仕入単価（買取単価）
  cost integer NOT NULL DEFAULT 0 CONSTRAINT inventory_items_cost_check CHECK (cost >= 0),
  -- 売価（税込）。未設定なら販売できない
  sale_price integer CONSTRAINT inventory_items_sale_price_check CHECK (sale_price IS NULL OR sale_price >= 0),
  quantity integer NOT NULL CONSTRAINT inventory_items_quantity_check CHECK (quantity >= 0),
  allocation text NOT NULL DEFAULT 'pending' CONSTRAINT inventory_items_allocation_check CHECK (allocation IN ('pending', 'store', 'transfer')),
  -- banded: 価格帯へ回して個体の記録をやめた
  status text NOT NULL DEFAULT 'in_stock' CONSTRAINT inventory_items_status_check CHECK (status IN ('in_stock', 'sold', 'written_off', 'transferred', 'banded')),
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, barcode)
);
-- 同じ買取明細から二重に入庫しない（分割で作った行は除く）
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_source_item_idx ON public.inventory_items(source_order_item_id)
  WHERE source_order_item_id IS NOT NULL AND parent_item_id IS NULL;
CREATE INDEX IF NOT EXISTS inventory_items_tenant_state_idx ON public.inventory_items(tenant_id, status, allocation, created_at DESC);
DROP TRIGGER IF EXISTS trg_inventory_items_updated_at ON public.inventory_items;
CREATE TRIGGER trg_inventory_items_updated_at BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 価格帯（安価カード）は個体を持たず、帯ごとの枚数だけ持つ。実数とのずれは棚卸しで直すので負も許す
ALTER TABLE public.price_bands ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.price_bands.stock_quantity IS '価格帯の在庫枚数（理論値）。販売で減り、振り分けで増える';

-- ---------------------------------------------------------------------------
-- 2. 販売（sales / sale_items）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  -- SL-YYYYMMDD-NNN（テナントごとに一意）
  sale_number text NOT NULL,
  -- 税込合計と、そのうちの消費税（10% 内税）
  total integer NOT NULL CONSTRAINT sales_total_check CHECK (total >= 0),
  tax_amount integer NOT NULL CONSTRAINT sales_tax_check CHECK (tax_amount >= 0),
  tendered integer NOT NULL CONSTRAINT sales_tendered_check CHECK (tendered >= 0),
  change_due integer NOT NULL CONSTRAINT sales_change_check CHECK (change_due >= 0),
  register_session_id uuid NOT NULL REFERENCES public.register_sessions(id),
  sold_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sold_by_name text,
  voided_at timestamptz,
  voided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  voided_by_name text,
  void_reason text,
  -- 取消で返金したときに開いていたレジ（返金はそのレジの現金から出る）
  void_register_session_id uuid REFERENCES public.register_sessions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sale_number),
  CONSTRAINT sales_void_check CHECK (voided_at IS NULL OR (void_reason IS NOT NULL AND void_register_session_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS sales_tenant_created_idx ON public.sales(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sales_session_idx ON public.sales(register_session_id);
CREATE INDEX IF NOT EXISTS sales_void_session_idx ON public.sales(void_register_session_id) WHERE void_register_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES public.inventory_items(id),
  price_band_id uuid REFERENCES public.price_bands(id),
  name text NOT NULL,
  quantity integer NOT NULL CONSTRAINT sale_items_quantity_check CHECK (quantity > 0),
  -- 税込の単価
  unit_price integer NOT NULL CONSTRAINT sale_items_unit_price_check CHECK (unit_price >= 0),
  -- 販売時点の仕入単価（粗利の計算用。価格帯は買取単価）
  unit_cost integer NOT NULL DEFAULT 0,
  tax_rate integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_items_target_check CHECK ((inventory_item_id IS NOT NULL) <> (price_band_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS sale_items_tenant_created_idx ON public.sale_items(tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. 入出庫履歴（inventory_movements）。追記のみ
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  price_band_id uuid REFERENCES public.price_bands(id) ON DELETE SET NULL,
  -- in: 入庫 / sale: 販売 / return: 販売の取消 / adjust: 調整 / transfer: 本部へ移動 / allocate: 振り分け
  kind text NOT NULL CONSTRAINT inventory_movements_kind_check CHECK (kind IN ('in', 'sale', 'return', 'adjust', 'transfer', 'allocate')),
  -- 増減（入庫は正、出庫は負）
  quantity integer NOT NULL,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  reason text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_movements_item_idx ON public.inventory_movements(inventory_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_tenant_idx ON public.inventory_movements(tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. RLS: 読み取りはテナントのスタッフ全員。書き込みは service_role（サーバーアクションと下の関数）だけ
-- ---------------------------------------------------------------------------
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['inventory_items','sales','sale_items','inventory_movements'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select_tenant ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select_tenant ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN (''admin'',''manager'',''staff''))', t, t);
  END LOOP;
END $$;
REVOKE ALL ON SEQUENCE public.inventory_barcode_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SEQUENCE public.inventory_barcode_seq TO service_role;

-- ---------------------------------------------------------------------------
-- 5. 買取 → 在庫（振分待ち）。支払済の店頭買取の明細をまだ入庫していない分だけ入れる。何度呼んでもよい
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_intake_paid_orders(p_tenant uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH ins AS (
    INSERT INTO public.inventory_items (tenant_id, product_id, name, model_number, condition_rank, psa_cert_number, source, source_order_item_id, source_order_id, cost, quantity)
    SELECT o.tenant_id, i.product_id, i.product_name, p.model_number, i.condition_rank,
           nullif(array_to_string(i.psa_cert_numbers, ', '), ''),
           'buyback', i.id, o.id, i.unit_price, i.quantity
    FROM public.order_items i
    JOIN public.orders o ON o.id = i.order_id
    LEFT JOIN public.products p ON p.id = i.product_id
    WHERE o.tenant_id = p_tenant
      AND o.channel = 'store'
      AND o.status IN ('振込済', '振込確認済')
      AND i.quantity > 0
      AND NOT EXISTS (SELECT 1 FROM public.inventory_items x WHERE x.source_order_item_id = i.id)
    ON CONFLICT DO NOTHING
    RETURNING id, tenant_id, quantity, source_order_id
  ), mv AS (
    INSERT INTO public.inventory_movements (tenant_id, inventory_item_id, kind, quantity, order_id, reason)
    SELECT tenant_id, id, 'in', quantity, source_order_id, '買取' FROM ins
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM mv;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. 振り分け（振分待ち → 店頭販売 / 価格帯 / 本部へ移動）。一部の枚数だけ回すと在庫を分割する
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_allocate_inventory(
  p_tenant uuid, p_item uuid, p_target text, p_quantity integer,
  p_sale_price integer, p_band uuid, p_user uuid, p_user_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_item public.inventory_items%ROWTYPE;
  v_band public.price_bands%ROWTYPE;
  v_result uuid;
BEGIN
  IF p_target NOT IN ('store', 'band', 'transfer') THEN
    RAISE EXCEPTION '振り分け先が正しくありません' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_item FROM public.inventory_items WHERE id = p_item AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '在庫が見つかりません' USING ERRCODE = 'P0001'; END IF;
  IF v_item.status <> 'in_stock' OR v_item.allocation <> 'pending' THEN
    RAISE EXCEPTION 'この在庫は振り分け済みです' USING ERRCODE = 'P0001';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > v_item.quantity THEN
    RAISE EXCEPTION '枚数は 1〜% で指定してください', v_item.quantity USING ERRCODE = 'P0001';
  END IF;

  IF p_target = 'band' THEN
    SELECT * INTO v_band FROM public.price_bands WHERE id = p_band AND tenant_id = p_tenant AND is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION '価格帯が見つかりません' USING ERRCODE = 'P0001'; END IF;
    UPDATE public.price_bands SET stock_quantity = stock_quantity + p_quantity WHERE id = v_band.id;
    UPDATE public.inventory_items
      SET quantity = quantity - p_quantity,
          status = CASE WHEN quantity - p_quantity = 0 THEN 'banded' ELSE status END
      WHERE id = v_item.id;
    INSERT INTO public.inventory_movements (tenant_id, inventory_item_id, kind, quantity, reason, created_by, created_by_name)
      VALUES (p_tenant, v_item.id, 'allocate', -p_quantity, '価格帯「' || v_band.label || '」へ', p_user, p_user_name);
    INSERT INTO public.inventory_movements (tenant_id, price_band_id, kind, quantity, reason, created_by, created_by_name)
      VALUES (p_tenant, v_band.id, 'in', p_quantity, '振り分け: ' || v_item.name, p_user, p_user_name);
    RETURN v_item.id;
  END IF;

  IF p_target = 'store' AND (p_sale_price IS NULL OR p_sale_price < 0) THEN
    RAISE EXCEPTION '売価を入力してください' USING ERRCODE = 'P0001';
  END IF;

  IF p_quantity = v_item.quantity THEN
    v_result := v_item.id;
  ELSE
    UPDATE public.inventory_items SET quantity = quantity - p_quantity WHERE id = v_item.id;
    INSERT INTO public.inventory_items (tenant_id, product_id, name, model_number, condition_rank, psa_cert_number, source, source_order_item_id, source_order_id, parent_item_id, cost, quantity, created_by)
      VALUES (p_tenant, v_item.product_id, v_item.name, v_item.model_number, v_item.condition_rank, v_item.psa_cert_number, v_item.source, v_item.source_order_item_id, v_item.source_order_id, v_item.id, v_item.cost, p_quantity, p_user)
      RETURNING id INTO v_result;
  END IF;

  IF p_target = 'store' THEN
    UPDATE public.inventory_items SET allocation = 'store', sale_price = p_sale_price WHERE id = v_result;
    INSERT INTO public.inventory_movements (tenant_id, inventory_item_id, kind, quantity, reason, created_by, created_by_name)
      VALUES (p_tenant, v_result, 'allocate', 0, '店頭販売へ', p_user, p_user_name);
  ELSE
    UPDATE public.inventory_items SET allocation = 'transfer', status = 'transferred' WHERE id = v_result;
    INSERT INTO public.inventory_movements (tenant_id, inventory_item_id, kind, quantity, reason, created_by, created_by_name)
      VALUES (p_tenant, v_result, 'transfer', -p_quantity, '本部へ移動', p_user, p_user_name);
  END IF;
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. 在庫数の調整（個別の在庫 / 価格帯）。理由は必須
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_adjust_inventory(
  p_tenant uuid, p_item uuid, p_band uuid, p_new_quantity integer, p_reason text, p_user uuid, p_user_name text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_old integer;
  v_status text;
BEGIN
  IF coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION '理由を入力してください' USING ERRCODE = 'P0001'; END IF;
  IF p_new_quantity IS NULL OR p_new_quantity < 0 OR p_new_quantity > 1000000 THEN
    RAISE EXCEPTION '数量は 0 以上で入力してください' USING ERRCODE = 'P0001';
  END IF;
  IF (p_item IS NULL) = (p_band IS NULL) THEN RAISE EXCEPTION '対象が正しくありません' USING ERRCODE = 'P0001'; END IF;

  IF p_band IS NOT NULL THEN
    SELECT stock_quantity INTO v_old FROM public.price_bands WHERE id = p_band AND tenant_id = p_tenant FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION '価格帯が見つかりません' USING ERRCODE = 'P0001'; END IF;
    UPDATE public.price_bands SET stock_quantity = p_new_quantity WHERE id = p_band;
    INSERT INTO public.inventory_movements (tenant_id, price_band_id, kind, quantity, reason, created_by, created_by_name)
      VALUES (p_tenant, p_band, 'adjust', p_new_quantity - v_old, btrim(p_reason), p_user, p_user_name);
    RETURN p_new_quantity - v_old;
  END IF;

  SELECT quantity, status INTO v_old, v_status FROM public.inventory_items WHERE id = p_item AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '在庫が見つかりません' USING ERRCODE = 'P0001'; END IF;
  IF v_status NOT IN ('in_stock', 'written_off') THEN RAISE EXCEPTION 'この在庫は調整できません' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.inventory_items
    SET quantity = p_new_quantity, status = CASE WHEN p_new_quantity = 0 THEN 'written_off' ELSE 'in_stock' END
    WHERE id = p_item;
  INSERT INTO public.inventory_movements (tenant_id, inventory_item_id, kind, quantity, reason, created_by, created_by_name)
    VALUES (p_tenant, p_item, 'adjust', p_new_quantity - v_old, btrim(p_reason), p_user, p_user_name);
  RETURN p_new_quantity - v_old;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. 会計。在庫の引き当て・販売の記録・採番を 1 トランザクションで行う
-- p_lines: [{"inventory_item_id": "...", "quantity": 1, "unit_price": 1200}, {"price_band_id": "...", "quantity": 3, "unit_price": 100}]
-- unit_price は画面に出ていた売価。会計までに売価が変わっていたら止める
-- 同じ p_sale で 2 回呼ばれたら 1 回目の結果を返す（二重会計の防止）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_complete_sale(
  p_tenant uuid, p_sale uuid, p_lines jsonb, p_tendered integer, p_user uuid, p_user_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing public.sales%ROWTYPE;
  v_session uuid;
  v_line jsonb;
  v_qty integer;
  v_expected integer;
  v_item public.inventory_items%ROWTYPE;
  v_band public.price_bands%ROWTYPE;
  v_total bigint := 0;
  v_tax integer;
  v_today text;
  v_max integer;
  v_number text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('store_sale:' || p_tenant::text));
  SELECT * INTO v_existing FROM public.sales WHERE id = p_sale;
  IF FOUND THEN
    IF v_existing.tenant_id <> p_tenant THEN RAISE EXCEPTION '不正なリクエストです' USING ERRCODE = 'P0001'; END IF;
    RETURN jsonb_build_object('sale_id', v_existing.id, 'sale_number', v_existing.sale_number, 'total', v_existing.total, 'change_due', v_existing.change_due, 'duplicate', true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant AND mode = 'store') THEN
    RAISE EXCEPTION 'この店舗では販売は使えません' USING ERRCODE = 'P0001';
  END IF;
  SELECT id INTO v_session FROM public.register_sessions WHERE tenant_id = p_tenant AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1;
  IF v_session IS NULL THEN RAISE EXCEPTION 'レジが開局されていません。レジ画面で開局してから会計してください' USING ERRCODE = 'P0001'; END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'カートが空です' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_array_length(p_lines) > 200 THEN RAISE EXCEPTION '明細が多すぎます' USING ERRCODE = 'P0001'; END IF;

  v_today := to_char(now() AT TIME ZONE 'Asia/Tokyo', 'YYYYMMDD');
  SELECT COALESCE(MAX(CAST(SUBSTRING(sale_number FROM '^SL-' || v_today || '-(\d+)$') AS integer)), 0) INTO v_max
    FROM public.sales WHERE tenant_id = p_tenant AND sale_number LIKE 'SL-' || v_today || '-%';
  v_number := 'SL-' || v_today || '-' || lpad((v_max + 1)::text, 3, '0');

  -- 先に販売の行を作り（合計は後で確定）、明細と在庫を処理する
  INSERT INTO public.sales (id, tenant_id, sale_number, total, tax_amount, tendered, change_due, register_session_id, sold_by, sold_by_name)
    VALUES (p_sale, p_tenant, v_number, 0, 0, 0, 0, v_session, p_user, p_user_name);

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_qty := (v_line->>'quantity')::integer;
    v_expected := (v_line->>'unit_price')::integer;
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 10000 THEN RAISE EXCEPTION '数量が正しくありません' USING ERRCODE = 'P0001'; END IF;

    IF v_line ? 'inventory_item_id' THEN
      SELECT * INTO v_item FROM public.inventory_items WHERE id = (v_line->>'inventory_item_id')::uuid AND tenant_id = p_tenant FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION '在庫が見つかりません' USING ERRCODE = 'P0001'; END IF;
      IF v_item.status <> 'in_stock' OR v_item.allocation <> 'store' THEN
        RAISE EXCEPTION '「%」は販売できる在庫ではありません（売約済みか、振り分け前です）', v_item.name USING ERRCODE = 'P0001';
      END IF;
      IF v_item.sale_price IS NULL THEN RAISE EXCEPTION '「%」は売価が未設定です', v_item.name USING ERRCODE = 'P0001'; END IF;
      IF v_item.quantity < v_qty THEN RAISE EXCEPTION '「%」の在庫が足りません（残り %）', v_item.name, v_item.quantity USING ERRCODE = 'P0001'; END IF;
      IF v_expected IS NULL OR v_expected <> v_item.sale_price THEN
        RAISE EXCEPTION '「%」の売価が変わりました。カートに入れ直してください', v_item.name USING ERRCODE = 'P0001';
      END IF;
      UPDATE public.inventory_items
        SET quantity = quantity - v_qty, status = CASE WHEN quantity - v_qty = 0 THEN 'sold' ELSE status END
        WHERE id = v_item.id;
      INSERT INTO public.sale_items (tenant_id, sale_id, inventory_item_id, name, quantity, unit_price, unit_cost)
        VALUES (p_tenant, p_sale, v_item.id, v_item.name, v_qty, v_item.sale_price, v_item.cost);
      INSERT INTO public.inventory_movements (tenant_id, inventory_item_id, kind, quantity, sale_id, created_by, created_by_name)
        VALUES (p_tenant, v_item.id, 'sale', -v_qty, p_sale, p_user, p_user_name);
      v_total := v_total + v_item.sale_price::bigint * v_qty;
    ELSIF v_line ? 'price_band_id' THEN
      SELECT * INTO v_band FROM public.price_bands WHERE id = (v_line->>'price_band_id')::uuid AND tenant_id = p_tenant AND is_active FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION '価格帯が見つかりません' USING ERRCODE = 'P0001'; END IF;
      IF v_band.sell_price IS NULL THEN RAISE EXCEPTION '価格帯「%」は売価が未設定です', v_band.label USING ERRCODE = 'P0001'; END IF;
      IF v_expected IS NULL OR v_expected <> v_band.sell_price THEN
        RAISE EXCEPTION '価格帯「%」の売価が変わりました。カートに入れ直してください', v_band.label USING ERRCODE = 'P0001';
      END IF;
      UPDATE public.price_bands SET stock_quantity = stock_quantity - v_qty WHERE id = v_band.id;
      INSERT INTO public.sale_items (tenant_id, sale_id, price_band_id, name, quantity, unit_price, unit_cost)
        VALUES (p_tenant, p_sale, v_band.id, v_band.label, v_qty, v_band.sell_price, v_band.buy_price);
      INSERT INTO public.inventory_movements (tenant_id, price_band_id, kind, quantity, sale_id, created_by, created_by_name)
        VALUES (p_tenant, v_band.id, 'sale', -v_qty, p_sale, p_user, p_user_name);
      v_total := v_total + v_band.sell_price::bigint * v_qty;
    ELSE
      RAISE EXCEPTION '明細が正しくありません' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  IF v_total > 100000000 THEN RAISE EXCEPTION '合計金額が大きすぎます' USING ERRCODE = 'P0001'; END IF;
  IF p_tendered IS NULL OR p_tendered < v_total THEN
    RAISE EXCEPTION '預り金が合計（% 円）に足りません', v_total USING ERRCODE = 'P0001';
  END IF;
  -- 10% 内税。1 円未満は切り捨て
  v_tax := floor(v_total * 10 / 110.0)::integer;
  UPDATE public.sales SET total = v_total::integer, tax_amount = v_tax, tendered = p_tendered, change_due = p_tendered - v_total::integer WHERE id = p_sale;
  RETURN jsonb_build_object('sale_id', p_sale, 'sale_number', v_number, 'total', v_total::integer, 'change_due', p_tendered - v_total::integer, 'duplicate', false);
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. 販売の取消（全額返金して在庫に戻す）。返金は開局中のレジの現金から出る
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_void_sale(
  p_tenant uuid, p_sale uuid, p_reason text, p_user uuid, p_user_name text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_session uuid;
  v_line public.sale_items%ROWTYPE;
BEGIN
  IF coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION '取消の理由を入力してください' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '販売が見つかりません' USING ERRCODE = 'P0001'; END IF;
  IF v_sale.voided_at IS NOT NULL THEN RAISE EXCEPTION 'この販売は取消済みです' USING ERRCODE = 'P0001'; END IF;
  SELECT id INTO v_session FROM public.register_sessions WHERE tenant_id = p_tenant AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1;
  IF v_session IS NULL THEN RAISE EXCEPTION 'レジが開局されていません。レジ画面で開局してから取り消してください' USING ERRCODE = 'P0001'; END IF;

  FOR v_line IN SELECT * FROM public.sale_items WHERE sale_id = p_sale LOOP
    IF v_line.inventory_item_id IS NOT NULL THEN
      UPDATE public.inventory_items SET quantity = quantity + v_line.quantity, status = 'in_stock'
        WHERE id = v_line.inventory_item_id AND tenant_id = p_tenant;
      INSERT INTO public.inventory_movements (tenant_id, inventory_item_id, kind, quantity, sale_id, reason, created_by, created_by_name)
        VALUES (p_tenant, v_line.inventory_item_id, 'return', v_line.quantity, p_sale, btrim(p_reason), p_user, p_user_name);
    ELSE
      UPDATE public.price_bands SET stock_quantity = stock_quantity + v_line.quantity WHERE id = v_line.price_band_id AND tenant_id = p_tenant;
      INSERT INTO public.inventory_movements (tenant_id, price_band_id, kind, quantity, sale_id, reason, created_by, created_by_name)
        VALUES (p_tenant, v_line.price_band_id, 'return', v_line.quantity, p_sale, btrim(p_reason), p_user, p_user_name);
    END IF;
  END LOOP;

  UPDATE public.sales
    SET voided_at = now(), voided_by = p_user, voided_by_name = p_user_name, void_reason = btrim(p_reason), void_register_session_id = v_session
    WHERE id = p_sale;
  RETURN v_sale.total;
END;
$$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY[
    'store_intake_paid_orders(uuid)',
    'store_allocate_inventory(uuid, uuid, text, integer, integer, uuid, uuid, text)',
    'store_adjust_inventory(uuid, uuid, uuid, integer, text, uuid, text)',
    'store_complete_sale(uuid, uuid, jsonb, integer, uuid, text)',
    'store_void_sale(uuid, uuid, text, uuid, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;

COMMENT ON TABLE public.inventory_items IS '店舗の在庫。買取の支払い完了で振分待ちとして入り、店頭販売・価格帯・本部移動に振り分ける';
COMMENT ON TABLE public.sales IS '店頭販売。税込・10% 内税。取消は全額返金で在庫に戻す';
COMMENT ON TABLE public.sale_items IS '販売の明細。個別の在庫か価格帯のどちらか';
COMMENT ON TABLE public.inventory_movements IS '在庫の入出庫履歴（追記のみ）';

COMMIT;
