-- 店舗 POS 段階 1 の前半: 買取受付と査定（docs/pos/design.md 3.1 節 1〜3、5.1 / 5.2 節）。
-- 通販（channel = 'online'）の動作は変えない。既存行はすべて既定値のまま。
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 店頭のお客様（store_customers）
-- 既存の customers は id が auth.users を参照する会員アカウント専用で、
-- 店頭の来店客（アカウントを持たない）を入れられないため別テーブルにする。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL DEFAULT '',
  name_kana text,
  phone text,
  -- 検索用。全角数字を半角にし、ハイフン・空白を除いた数字だけ
  phone_normalized text GENERATED ALWAYS AS (regexp_replace(translate(coalesce(phone, ''), '０１２３４５６７８９', '0123456789'), '\D', '', 'g')) STORED,
  address text,
  birth_date date,
  occupation text,
  -- 直近の本人確認（段階 1 後半の本人確認画面で更新する。リピーターの呼び出し用）
  last_document_type text,
  last_verified_at timestamptz,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS store_customers_tenant_phone_idx ON public.store_customers(tenant_id, phone_normalized);
CREATE INDEX IF NOT EXISTS store_customers_tenant_name_idx ON public.store_customers(tenant_id, name);
DROP TRIGGER IF EXISTS trg_store_customers_updated_at ON public.store_customers;
CREATE TRIGGER trg_store_customers_updated_at BEFORE UPDATE ON public.store_customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.store_customers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_customers FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_customers TO authenticated, service_role;
DROP POLICY IF EXISTS store_customers_select_tenant ON public.store_customers;
CREATE POLICY store_customers_select_tenant ON public.store_customers FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN ('admin','manager','staff'));
DROP POLICY IF EXISTS store_customers_insert_tenant ON public.store_customers;
CREATE POLICY store_customers_insert_tenant ON public.store_customers FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN ('admin','manager','staff'));
DROP POLICY IF EXISTS store_customers_update_tenant ON public.store_customers;
CREATE POLICY store_customers_update_tenant ON public.store_customers FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN ('admin','manager','staff'))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN ('admin','manager','staff'));
DROP POLICY IF EXISTS store_customers_delete_admin ON public.store_customers;
CREATE POLICY store_customers_delete_admin ON public.store_customers FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) = 'admin');
COMMENT ON TABLE public.store_customers IS '店頭の来店客。会員アカウント（customers）とは別。本人確認の内容は段階 1 後半で更新する';

-- ---------------------------------------------------------------------------
-- 2. 状態ランク表（condition_ranks）と価格帯（price_bands）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.condition_ranks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  code text NOT NULL,
  label text NOT NULL,
  -- 価格表の単価に掛ける率。null は「個別に金額と理由を入れる」ランク
  rate numeric(4,3) CONSTRAINT condition_ranks_rate_check CHECK (rate IS NULL OR (rate >= 0 AND rate <= 1)),
  description text,
  sample_image_path text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
DROP TRIGGER IF EXISTS trg_condition_ranks_updated_at ON public.condition_ranks;
CREATE TRIGGER trg_condition_ranks_updated_at BEFORE UPDATE ON public.condition_ranks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS public.price_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  label text NOT NULL,
  buy_price integer NOT NULL CONSTRAINT price_bands_buy_price_check CHECK (buy_price >= 0),
  sell_price integer CONSTRAINT price_bands_sell_price_check CHECK (sell_price IS NULL OR sell_price >= 0),
  -- 価格帯はスリーブの色で識別する（6.2 節）
  sleeve_color text,
  barcode text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, label)
);
DROP TRIGGER IF EXISTS trg_price_bands_updated_at ON public.price_bands;
CREATE TRIGGER trg_price_bands_updated_at BEFORE UPDATE ON public.price_bands
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 読み取りはテナントのスタッフ全員、書き込みは二段階認証済みの admin だけ（2026-11-07 決定: 店舗は staff で運用し、遠隔の管理者が設定を持つ）
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['condition_ranks','price_bands'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated, service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select_tenant ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select_tenant ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN (''admin'',''manager'',''staff''))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write_manager ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_write_manager ON public.%I FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) = ''admin'' AND auth.jwt()->>''aal'' = ''aal2'') WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) = ''admin'' AND auth.jwt()->>''aal'' = ''aal2'')', t, t);
  END LOOP;
END $$;
COMMENT ON TABLE public.condition_ranks IS '店舗の状態ランク表。rate を価格表の単価に掛けて買取単価にする。null は個別入力';
COMMENT ON TABLE public.price_bands IS '安価カードのまとめ買取・販売用の価格帯。スリーブの色で識別する';

-- ---------------------------------------------------------------------------
-- 3. orders / order_items に店頭用の列を足す
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'online'
    CONSTRAINT orders_channel_check CHECK (channel IN ('online', 'store')),
  ADD COLUMN IF NOT EXISTS store_customer_id uuid REFERENCES public.store_customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS intake_count integer
    CONSTRAINT orders_intake_count_check CHECK (intake_count IS NULL OR intake_count >= 0),
  ADD COLUMN IF NOT EXISTS intake_kind text
    CONSTRAINT orders_intake_kind_check CHECK (intake_kind IS NULL OR intake_kind IN ('singles', 'bulk', 'both'));
CREATE INDEX IF NOT EXISTS orders_store_open_idx ON public.orders(tenant_id, created_at DESC) WHERE channel = 'store';
CREATE INDEX IF NOT EXISTS orders_store_customer_idx ON public.orders(store_customer_id) WHERE store_customer_id IS NOT NULL;
COMMENT ON COLUMN public.orders.channel IS 'online: 通販の申込。store: 店頭買取（POS）。店頭では配送・振込系の列を使わない';
COMMENT ON COLUMN public.orders.store_customer_id IS '店頭のお客様（store_customers）。受付時に未登録なら null、本人確認で紐付ける';
COMMENT ON COLUMN public.orders.intake_count IS '受付時の持込点数（概算）';
COMMENT ON COLUMN public.orders.intake_kind IS '受付時の区分。singles: シングル中心、bulk: まとめ、both: 両方';

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS condition_rank text,
  ADD COLUMN IF NOT EXISTS price_band_id uuid REFERENCES public.price_bands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS list_price integer
    CONSTRAINT order_items_list_price_check CHECK (list_price IS NULL OR list_price >= 0),
  ADD COLUMN IF NOT EXISTS deduction_reason text;
COMMENT ON COLUMN public.order_items.condition_rank IS '査定時の状態ランク（condition_ranks.code）';
COMMENT ON COLUMN public.order_items.price_band_id IS 'まとめ買取の価格帯。設定時は 1 枚ずつ登録しない';
COMMENT ON COLUMN public.order_items.list_price IS 'ランク適用前の価格表の単価。unit_price との差が減額';
COMMENT ON COLUMN public.order_items.deduction_reason IS 'ランク外の個別減額の理由（単価を手で下げたときは必須）';

-- ---------------------------------------------------------------------------
-- 4. 注文番号: 店頭買取は ST-YYYYMMDD-NNN（受付番号は末尾の NNN）
-- 通販の BB- 採番は従来どおり。order_number は全体で一意なので、ST- も全体で MAX を取る。
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    today_str TEXT;
    max_number INTEGER;
    prefix TEXT;
BEGIN
    today_str := to_char(now() AT TIME ZONE 'Asia/Tokyo', 'YYYYMMDD');

    IF NEW.channel = 'store' THEN
        prefix := 'ST-' || today_str || '-';
        SELECT COALESCE(MAX(
          CAST(SUBSTRING(order_number FROM '^ST-' || today_str || '-(\d+)$') AS INTEGER)
        ), 0) INTO max_number
        FROM public.orders
        WHERE order_number LIKE prefix || '%';
        NEW.order_number := prefix || lpad((max_number + 1)::TEXT, 3, '0');
        RETURN NEW;
    END IF;

    SELECT COALESCE(MAX(
      CAST(SUBSTRING(order_number FROM 'BB-' || today_str || '-(\d+)') AS INTEGER)
    ), 0) INTO max_number
    FROM public.orders
    WHERE order_number LIKE 'BB-' || today_str || '-%';

    NEW.order_number := 'BB-' || today_str || '-' || lpad((max_number + 1)::TEXT, 4, '0');
    RETURN NEW;
END;
$$;

COMMIT;
