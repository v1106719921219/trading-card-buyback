-- 店舗 POS: 棚卸し（docs/pos/design.md 6.4 節）。
-- 理論在庫（個別の在庫は 1 件ごと、安価カードは価格帯ごと）を一覧にし、現場は実数を入れるだけ。
-- 差があった行だけ理由を入れて確定し、在庫を実数に合わせる。未入力の行は変えない（一部だけの棚卸しもできる）。
-- 棚卸し中に販売や振り分けがあってもずれないように、実数を入れた時点の理論値を行に残し、
-- 確定では「実数 − その時点の理論値」の差だけを現在の在庫に足す。
-- 通販（channel = 'online'）の動作は変えない。products には触らない。
-- 書き込みはサーバー（service_role）と下の関数だけ。スタッフは読み取りのみ。
BEGIN;

CREATE TABLE IF NOT EXISTS public.stocktakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  status text NOT NULL DEFAULT 'open' CONSTRAINT stocktakes_status_check CHECK (status IN ('open', 'confirmed', 'cancelled')),
  note text,
  started_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_by_name text,
  started_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_by_name text,
  closed_at timestamptz,
  -- 確定時の集計
  line_count integer NOT NULL DEFAULT 0,
  counted_count integer NOT NULL DEFAULT 0,
  diff_count integer NOT NULL DEFAULT 0,
  -- 在庫に反映した増減の合計（枚数）と、その仕入単価ベースの金額（マイナスは不足）
  diff_quantity integer NOT NULL DEFAULT 0,
  diff_cost bigint NOT NULL DEFAULT 0
);
-- 進行中の棚卸しはテナントに 1 つだけ
CREATE UNIQUE INDEX IF NOT EXISTS stocktakes_one_open_idx ON public.stocktakes(tenant_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS stocktakes_tenant_idx ON public.stocktakes(tenant_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.stocktake_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  stocktake_id uuid NOT NULL REFERENCES public.stocktakes(id) ON DELETE CASCADE,
  -- item: 個別の在庫 / band: 価格帯
  kind text NOT NULL CONSTRAINT stocktake_lines_kind_check CHECK (kind IN ('item', 'band')),
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  price_band_id uuid REFERENCES public.price_bands(id) ON DELETE SET NULL,
  position integer NOT NULL,
  -- 開始時点の写し（後で在庫や価格帯が変わっても記録が読めるように）
  name text NOT NULL,
  detail text,
  barcode text,
  allocation text,
  unit_cost integer NOT NULL DEFAULT 0,
  sale_price integer,
  -- 理論値。開始時点の数で入れ、実数を入れるたびにその時点の在庫数で上書きする
  expected_quantity integer NOT NULL,
  -- 実数。NULL は未入力（確定しても在庫を変えない）
  counted_quantity integer CONSTRAINT stocktake_lines_counted_check CHECK (counted_quantity IS NULL OR counted_quantity >= 0),
  reason text,
  counted_by_name text,
  counted_at timestamptz,
  -- 確定で在庫に反映した増減。NULL は反映なし
  applied_diff integer,
  -- 実数が入っていて理論値と違う行
  has_diff boolean GENERATED ALWAYS AS (counted_quantity IS NOT NULL AND counted_quantity <> expected_quantity) STORED
);
CREATE INDEX IF NOT EXISTS stocktake_lines_stocktake_idx ON public.stocktake_lines(stocktake_id, position);
CREATE INDEX IF NOT EXISTS stocktake_lines_diff_idx ON public.stocktake_lines(stocktake_id, position) WHERE has_diff;
CREATE INDEX IF NOT EXISTS stocktake_lines_item_idx ON public.stocktake_lines(inventory_item_id) WHERE inventory_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stocktake_lines_band_idx ON public.stocktake_lines(price_band_id) WHERE price_band_id IS NOT NULL;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['stocktakes','stocktake_lines'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select_tenant ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select_tenant ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN (''admin'',''manager'',''staff''))', t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 1. 棚卸しを始める。有効な価格帯と、在庫のある個別在庫（振分待ち・店頭）を行にする
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_start_stocktake(p_tenant uuid, p_note text, p_user uuid, p_user_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid;
  v_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('store_stocktake:' || p_tenant::text));
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant AND mode = 'store') THEN
    RAISE EXCEPTION 'この店舗では棚卸しは使えません' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stocktakes WHERE tenant_id = p_tenant AND status = 'open') THEN
    RAISE EXCEPTION '進行中の棚卸しがあります。確定するか中止してから始めてください' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.stocktakes (tenant_id, note, started_by, started_by_name)
    VALUES (p_tenant, nullif(btrim(coalesce(p_note, '')), ''), p_user, p_user_name)
    RETURNING id INTO v_id;

  INSERT INTO public.stocktake_lines (tenant_id, stocktake_id, kind, inventory_item_id, price_band_id, position, name, detail, barcode, allocation, unit_cost, sale_price, expected_quantity)
  SELECT p_tenant, v_id, s.kind, s.item_id, s.band_id,
         row_number() OVER (ORDER BY s.grp, s.ord, s.name, s.created_at, coalesce(s.item_id, s.band_id)),
         s.name, s.detail, s.barcode, s.allocation, s.unit_cost, s.sale_price, s.expected
  FROM (
    SELECT 'band'::text AS kind, NULL::uuid AS item_id, b.id AS band_id, 0 AS grp, b.sort_order AS ord, b.label AS name,
           CASE WHEN b.sleeve_color IS NOT NULL THEN 'スリーブ: ' || b.sleeve_color END AS detail,
           NULL::text AS barcode, NULL::text AS allocation, b.buy_price AS unit_cost, b.sell_price AS sale_price,
           b.stock_quantity AS expected, now() AS created_at
    FROM public.price_bands b
    WHERE b.tenant_id = p_tenant AND b.is_active
    UNION ALL
    SELECT 'item', i.id, NULL, CASE WHEN i.allocation = 'store' THEN 1 ELSE 2 END, 0, i.name,
           nullif(concat_ws(' ・ ', i.model_number, CASE WHEN i.condition_rank IS NOT NULL THEN 'ランク ' || i.condition_rank END, CASE WHEN i.psa_cert_number IS NOT NULL THEN 'PSA ' || i.psa_cert_number END), ''),
           i.barcode, i.allocation, i.cost, i.sale_price, i.quantity, i.created_at
    FROM public.inventory_items i
    WHERE i.tenant_id = p_tenant AND i.status = 'in_stock' AND i.quantity > 0 AND i.allocation IN ('pending', 'store')
  ) s;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN RAISE EXCEPTION '棚卸しする在庫がありません' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.stocktakes SET line_count = v_count WHERE id = v_id;
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. 実数を入れる（p_counted が NULL なら未入力に戻す）。理論値はこの時点の在庫数に取り直す
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_count_stocktake_line(p_tenant uuid, p_line uuid, p_counted integer, p_reason text, p_user_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_line public.stocktake_lines%ROWTYPE;
  v_current integer;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 200), '');
BEGIN
  SELECT l.* INTO v_line FROM public.stocktake_lines l WHERE l.id = p_line AND l.tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '棚卸しの行が見つかりません' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stocktakes WHERE id = v_line.stocktake_id AND status = 'open') THEN
    RAISE EXCEPTION 'この棚卸しは確定または中止されています' USING ERRCODE = 'P0001';
  END IF;
  IF p_counted IS NOT NULL AND (p_counted < 0 OR p_counted > 1000000) THEN
    RAISE EXCEPTION '実数は 0 以上で入力してください' USING ERRCODE = 'P0001';
  END IF;

  IF v_line.kind = 'band' THEN
    SELECT stock_quantity INTO v_current FROM public.price_bands WHERE id = v_line.price_band_id AND tenant_id = p_tenant;
  ELSE
    SELECT CASE WHEN status = 'in_stock' THEN quantity ELSE 0 END INTO v_current
      FROM public.inventory_items WHERE id = v_line.inventory_item_id AND tenant_id = p_tenant;
  END IF;
  v_current := coalesce(v_current, 0);

  UPDATE public.stocktake_lines
    SET expected_quantity = v_current,
        counted_quantity = p_counted,
        reason = CASE WHEN p_counted IS NULL THEN NULL ELSE v_reason END,
        counted_by_name = CASE WHEN p_counted IS NULL THEN NULL ELSE p_user_name END,
        counted_at = CASE WHEN p_counted IS NULL THEN NULL ELSE now() END
    WHERE id = v_line.id;
  RETURN jsonb_build_object('expected', v_current, 'counted', p_counted, 'reason', CASE WHEN p_counted IS NULL THEN NULL ELSE v_reason END);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. 確定。差のある行を在庫に反映する。差のある行は理由が必須。未入力の行は変えない
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_confirm_stocktake(p_tenant uuid, p_stocktake uuid, p_user uuid, p_user_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_take public.stocktakes%ROWTYPE;
  v_line public.stocktake_lines%ROWTYPE;
  v_counted integer;
  v_missing integer;
  v_delta integer;
  v_old integer;
  v_new integer;
  v_status text;
  v_diff_count integer := 0;
  v_diff_qty integer := 0;
  v_diff_cost bigint := 0;
  v_skipped integer := 0;
BEGIN
  SELECT * INTO v_take FROM public.stocktakes WHERE id = p_stocktake AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '棚卸しが見つかりません' USING ERRCODE = 'P0001'; END IF;
  IF v_take.status <> 'open' THEN RAISE EXCEPTION 'この棚卸しは確定または中止されています' USING ERRCODE = 'P0001'; END IF;

  SELECT count(*) FILTER (WHERE counted_quantity IS NOT NULL),
         count(*) FILTER (WHERE counted_quantity IS NOT NULL AND counted_quantity <> expected_quantity AND coalesce(btrim(reason), '') = '')
    INTO v_counted, v_missing
    FROM public.stocktake_lines WHERE stocktake_id = p_stocktake;
  IF v_counted = 0 THEN RAISE EXCEPTION '実数が 1 行も入力されていません' USING ERRCODE = 'P0001'; END IF;
  IF v_missing > 0 THEN RAISE EXCEPTION '差のある % 行に理由が入っていません', v_missing USING ERRCODE = 'P0001'; END IF;

  FOR v_line IN
    SELECT * FROM public.stocktake_lines
    WHERE stocktake_id = p_stocktake AND counted_quantity IS NOT NULL AND counted_quantity <> expected_quantity
    ORDER BY position
  LOOP
    v_delta := v_line.counted_quantity - v_line.expected_quantity;
    IF v_line.kind = 'band' THEN
      UPDATE public.price_bands SET stock_quantity = stock_quantity + v_delta
        WHERE id = v_line.price_band_id AND tenant_id = p_tenant;
      IF NOT FOUND THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
      INSERT INTO public.inventory_movements (tenant_id, price_band_id, kind, quantity, reason, created_by, created_by_name)
        VALUES (p_tenant, v_line.price_band_id, 'adjust', v_delta, '棚卸し: ' || btrim(v_line.reason), p_user, p_user_name);
    ELSE
      SELECT CASE WHEN status = 'in_stock' THEN quantity ELSE 0 END, status INTO v_old, v_status
        FROM public.inventory_items WHERE id = v_line.inventory_item_id AND tenant_id = p_tenant FOR UPDATE;
      -- 棚卸し中に本部へ移動・価格帯へ回した在庫は、もう店の個別在庫ではないので触らない
      IF NOT FOUND OR v_status NOT IN ('in_stock', 'sold', 'written_off') THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
      v_new := greatest(0, v_old + v_delta);
      v_delta := v_new - v_old;
      IF v_delta = 0 THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
      UPDATE public.inventory_items
        SET quantity = v_new,
            status = CASE WHEN v_new > 0 THEN 'in_stock' WHEN v_status = 'in_stock' THEN 'written_off' ELSE v_status END
        WHERE id = v_line.inventory_item_id;
      INSERT INTO public.inventory_movements (tenant_id, inventory_item_id, kind, quantity, reason, created_by, created_by_name)
        VALUES (p_tenant, v_line.inventory_item_id, 'adjust', v_delta, '棚卸し: ' || btrim(v_line.reason), p_user, p_user_name);
    END IF;
    UPDATE public.stocktake_lines SET applied_diff = v_delta WHERE id = v_line.id;
    v_diff_count := v_diff_count + 1;
    v_diff_qty := v_diff_qty + v_delta;
    v_diff_cost := v_diff_cost + v_delta::bigint * v_line.unit_cost;
  END LOOP;

  UPDATE public.stocktakes
    SET status = 'confirmed', closed_at = now(), closed_by = p_user, closed_by_name = p_user_name,
        counted_count = v_counted, diff_count = v_diff_count, diff_quantity = v_diff_qty, diff_cost = v_diff_cost
    WHERE id = p_stocktake;
  RETURN jsonb_build_object('counted', v_counted, 'diff_count', v_diff_count, 'diff_quantity', v_diff_qty, 'diff_cost', v_diff_cost, 'skipped', v_skipped);
END;
$$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY[
    'store_start_stocktake(uuid, text, uuid, text)',
    'store_count_stocktake_line(uuid, uuid, integer, text, text)',
    'store_confirm_stocktake(uuid, uuid, uuid, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;

COMMENT ON TABLE public.stocktakes IS '店舗の棚卸し。進行中はテナントに 1 つ。確定で差を在庫に反映する';
COMMENT ON TABLE public.stocktake_lines IS '棚卸しの行（個別の在庫か価格帯）。理論値・実数・理由・反映した増減';

COMMIT;
