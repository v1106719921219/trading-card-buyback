-- 実店舗 POS（docs/pos/design.md 2.2 節）用のテナント設定列。
-- 既存テナントはすべて既定値（mode = 'online'）のままなので、通販側の動作は変わらない。
-- この移行を当てる前にコードだけ先に配備しても、列が無ければ「online」として扱われる。

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'online'
    CONSTRAINT tenants_mode_check CHECK (mode IN ('online', 'store')),
  ADD COLUMN IF NOT EXISTS cash_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_source_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS store_price_rate numeric(5,4) NOT NULL DEFAULT 1.0
    CONSTRAINT tenants_store_price_rate_check CHECK (store_price_rate > 0 AND store_price_rate <= 2),
  ADD COLUMN IF NOT EXISTS price_sync_time time,
  ADD COLUMN IF NOT EXISTS invoice_registration_number text,
  ADD COLUMN IF NOT EXISTS receipt_header jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS printer_address text,
  ADD COLUMN IF NOT EXISTS high_value_approval_threshold integer
    CONSTRAINT tenants_high_value_approval_threshold_check CHECK (high_value_approval_threshold IS NULL OR high_value_approval_threshold >= 0),
  ADD COLUMN IF NOT EXISTS customer_price_display text NOT NULL DEFAULT 'ipad'
    CONSTRAINT tenants_customer_price_display_check CHECK (customer_price_display IN ('ipad', 'qr', 'none'));

COMMENT ON COLUMN public.tenants.mode IS 'online: 通販（既存）。store: 実店舗 POS。store では通販の公開ページを出さず / は /pos へ誘導する';
COMMENT ON COLUMN public.tenants.cash_only IS 'true なら振込先入力・振込系の UI を隠す（店舗は現金のみ）';
COMMENT ON COLUMN public.tenants.price_source_tenant_id IS '価格同期の取り込み元テナント（店舗は通販 quadra の価格表をコピーする）';
COMMENT ON COLUMN public.tenants.store_price_rate IS '店舗の買取価格係数。取り込み元の価格に掛ける（例 0.95 = 95%）';
COMMENT ON COLUMN public.tenants.price_sync_time IS '自動価格同期の時刻。null なら自動同期しない';
COMMENT ON COLUMN public.tenants.invoice_registration_number IS '販売レシートに載せる適格請求書発行事業者の登録番号（登録している場合のみ）';
COMMENT ON COLUMN public.tenants.receipt_header IS 'レシートに載せる店名・住所・電話・古物商許可番号・注意書き（jsonb）';
COMMENT ON COLUMN public.tenants.printer_address IS 'レシートプリンタの IP アドレス（端末設定で上書き可）';
COMMENT ON COLUMN public.tenants.high_value_approval_threshold IS 'この金額以上の買取は manager の承認を必須にする。null なら承認不要';
COMMENT ON COLUMN public.tenants.customer_price_display IS '客向けの売価の見せ方。ipad: iPad の客向け表示、qr: QR コードの価格ページ、none: 表示しない';
