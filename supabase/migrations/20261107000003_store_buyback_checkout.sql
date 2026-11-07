-- 店舗 POS 段階 1 の後半: 本人確認・申込書兼受領書・古物台帳・レジ（docs/pos/design.md 3.1 節 4〜9、3.3 節、5.2 / 5.3 節）。
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 店頭の本人確認（store_identity_checks）
-- 既存の order_paper_kyc は振込口座の照合が前提なので流用しない。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_identity_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.store_customers(id) ON DELETE SET NULL,
  method text NOT NULL CONSTRAINT store_identity_checks_method_check CHECK (method IN ('id_document', 'handwritten')),
  document_type text,
  name text NOT NULL,
  address text NOT NULL,
  birth_date date NOT NULL,
  occupation text NOT NULL,
  age_at_check integer NOT NULL CONSTRAINT store_identity_checks_age_check CHECK (age_at_check >= 0 AND age_at_check < 150),
  -- 表面の画像（任意。裏面は保存しない）
  front_image_path text,
  -- 面前で手書きした文書の画像（method = handwritten のとき必須）
  handwritten_image_path text,
  guardian_name text,
  guardian_relation text,
  guardian_document_type text,
  guardian_image_path text,
  guardian_signature_path text,
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoke_reason text,
  CONSTRAINT store_identity_checks_handwritten_check CHECK (method <> 'handwritten' OR handwritten_image_path IS NOT NULL),
  CONSTRAINT store_identity_checks_document_check CHECK (method <> 'id_document' OR document_type IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS store_identity_checks_order_idx ON public.store_identity_checks(order_id);
CREATE INDEX IF NOT EXISTS store_identity_checks_customer_idx ON public.store_identity_checks(customer_id) WHERE customer_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. 申込書兼受領書（store_agreements）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  template_version text NOT NULL,
  -- 署名時点の明細・合計・本人確認内容・誓約文
  content_snapshot jsonb NOT NULL,
  signature_path text NOT NULL,
  pdf_path text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  witnessed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  voided_at timestamptz,
  void_reason text
);
CREATE INDEX IF NOT EXISTS store_agreements_order_idx ON public.store_agreements(order_id);

-- ---------------------------------------------------------------------------
-- 3. 古物台帳（kobutsu_ledger）: 支払い完了時に確定し、以後は更新・削除しない（追記のみ）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kobutsu_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  order_id uuid REFERENCES public.orders(id),
  sale_id uuid,
  transaction_type text NOT NULL CONSTRAINT kobutsu_ledger_type_check CHECK (transaction_type IN ('purchase', 'sale')),
  transacted_on date NOT NULL,
  -- 品目・数量・特徴（商品名、型番、状態ランク、PSA 番号、単価、金額）
  items jsonb NOT NULL,
  total_amount integer NOT NULL CONSTRAINT kobutsu_ledger_total_check CHECK (total_amount >= 0),
  counterparty_name text NOT NULL,
  counterparty_address text NOT NULL,
  counterparty_occupation text NOT NULL,
  counterparty_age integer NOT NULL,
  identity_method text NOT NULL,
  recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- 記録時のレジ担当者名（アカウントは共有なので名前も残す）
  recorded_by_name text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kobutsu_ledger_one_order UNIQUE (order_id)
);
CREATE INDEX IF NOT EXISTS kobutsu_ledger_tenant_date_idx ON public.kobutsu_ledger(tenant_id, transacted_on DESC);

CREATE OR REPLACE FUNCTION public.kobutsu_ledger_append_only() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION '古物台帳は追記のみです。訂正は新しい行で行ってください';
END $$;
REVOKE ALL ON FUNCTION public.kobutsu_ledger_append_only() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_kobutsu_ledger_append_only ON public.kobutsu_ledger;
CREATE TRIGGER trg_kobutsu_ledger_append_only BEFORE UPDATE OR DELETE ON public.kobutsu_ledger
  FOR EACH ROW EXECUTE FUNCTION public.kobutsu_ledger_append_only();

-- ---------------------------------------------------------------------------
-- 4. レジ（register_sessions / cash_movements）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.register_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  opened_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  opening_float integer NOT NULL CONSTRAINT register_sessions_float_check CHECK (opening_float >= 0),
  -- その日のレジ担当者の名前（店舗は 1 アカウントを共有するので、開局時に人を選ぶ。交代したら更新）
  operator_name text,
  closed_at timestamptz,
  closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expected_cash integer,
  counted_cash integer CONSTRAINT register_sessions_counted_check CHECK (counted_cash IS NULL OR counted_cash >= 0),
  difference integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- 同時に開いているレジはテナントごとに 1 つ
CREATE UNIQUE INDEX IF NOT EXISTS register_sessions_one_open_idx ON public.register_sessions(tenant_id) WHERE closed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  register_session_id uuid NOT NULL REFERENCES public.register_sessions(id) ON DELETE CASCADE,
  kind text NOT NULL CONSTRAINT cash_movements_kind_check CHECK (kind IN ('in', 'out')),
  amount integer NOT NULL CONSTRAINT cash_movements_amount_check CHECK (amount > 0),
  reason text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cash_movements_session_idx ON public.cash_movements(register_session_id);

-- ---------------------------------------------------------------------------
-- 5. RLS
--   読み取り: テナントのスタッフ全員
--   本人確認・申込書・レジ開局・入出金: スタッフも記録できる（2.3 節）
--   レジ締め: スタッフもできる（店舗は staff で運用する。2026-11-07 決定）
--   申込書・本人確認の取消: 二段階認証済みの admin / manager
--   古物台帳: 書き込みはサーバー（service_role）だけ。更新・削除はトリガーで全員禁止
-- ---------------------------------------------------------------------------
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['store_identity_checks','store_agreements','kobutsu_ledger','register_sessions','cash_movements'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select_tenant ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select_tenant ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN (''admin'',''manager'',''staff''))', t, t);
  END LOOP;
END $$;

GRANT INSERT ON public.store_identity_checks, public.store_agreements, public.register_sessions, public.cash_movements TO authenticated;
GRANT UPDATE ON public.store_identity_checks, public.store_agreements, public.register_sessions TO authenticated;

DROP POLICY IF EXISTS store_identity_checks_insert_staff ON public.store_identity_checks;
CREATE POLICY store_identity_checks_insert_staff ON public.store_identity_checks FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN ('admin','manager','staff')
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.tenant_id = public.get_user_tenant_id(auth.uid())));
DROP POLICY IF EXISTS store_identity_checks_update_manager ON public.store_identity_checks;
CREATE POLICY store_identity_checks_update_manager ON public.store_identity_checks FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN ('admin','manager') AND auth.jwt()->>'aal' = 'aal2')
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN ('admin','manager') AND auth.jwt()->>'aal' = 'aal2');

DROP POLICY IF EXISTS store_agreements_insert_staff ON public.store_agreements;
CREATE POLICY store_agreements_insert_staff ON public.store_agreements FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN ('admin','manager','staff')
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.tenant_id = public.get_user_tenant_id(auth.uid())));
DROP POLICY IF EXISTS store_agreements_update_manager ON public.store_agreements;
CREATE POLICY store_agreements_update_manager ON public.store_agreements FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN ('admin','manager') AND auth.jwt()->>'aal' = 'aal2')
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN ('admin','manager') AND auth.jwt()->>'aal' = 'aal2');

DROP POLICY IF EXISTS register_sessions_insert_staff ON public.register_sessions;
CREATE POLICY register_sessions_insert_staff ON public.register_sessions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN ('admin','manager','staff'));
DROP POLICY IF EXISTS register_sessions_update_manager ON public.register_sessions;
CREATE POLICY register_sessions_update_manager ON public.register_sessions FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN ('admin','manager','staff'))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN ('admin','manager','staff'));

DROP POLICY IF EXISTS cash_movements_insert_staff ON public.cash_movements;
CREATE POLICY cash_movements_insert_staff ON public.cash_movements FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.get_user_role(auth.uid()) IN ('admin','manager','staff')
    AND EXISTS (SELECT 1 FROM public.register_sessions s WHERE s.id = register_session_id AND s.tenant_id = public.get_user_tenant_id(auth.uid()) AND s.closed_at IS NULL));

COMMENT ON TABLE public.store_identity_checks IS '店頭買取の本人確認。台帳に転記する内容と、任意の表面画像（裏面は保存しない）';
COMMENT ON TABLE public.store_agreements IS '申込書兼受領書。署名 1 回で査定額への同意・誓約・現金の受領を兼ねる';
COMMENT ON TABLE public.kobutsu_ledger IS '古物台帳。支払い完了時に確定し、更新・削除はトリガーで禁止。3 年保存';
COMMENT ON TABLE public.register_sessions IS 'レジの開局〜閉局。理論残高と実数の突合';
COMMENT ON TABLE public.cash_movements IS 'レジの入出金（釣銭補充・経費）';

-- ---------------------------------------------------------------------------
-- 6. ストレージ: 非公開バケット store-documents（本人確認画像・手書き文書・署名・申込書 PDF）
-- {tenant_id}/{order_id}/... の階層。読み書きはサーバー（service_role）だけ。保存期間は台帳と同じ 3 年（期限削除は段階 3）
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('store-documents', 'store-documents', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

COMMIT;
