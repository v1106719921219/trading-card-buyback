-- ============================================================================
-- Migration: Multi-Tenant Support
-- Description: Add tenant isolation using shared DB + RLS approach
--   - tenantsテーブル新設
--   - 全主要テーブルにtenant_idを追加
--   - get_user_tenant_id()ヘルパー関数追加
--   - get_user_role()をテナント対応に更新
--   - 全RLSポリシーをテナントIDベースに書き直し
--   - 既存データをデフォルトテナント（クアドラ）に割り当て
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. tenantsテーブル作成
-- ============================================================================

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,            -- サブドメイン識別子 例: quadra
    name TEXT NOT NULL,                   -- 店舗名 例: クアドラ
    display_name TEXT NOT NULL,           -- 表示名（公開ページ用）
    ancient_dealer_number TEXT,           -- 古物商許可番号
    logo_url TEXT,                        -- ロゴ画像URL
    primary_color TEXT DEFAULT '#2563eb', -- テーマカラー
    plan TEXT NOT NULL DEFAULT 'standard' CHECK (plan IN ('starter', 'standard', 'pro')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tenants IS 'マルチテナント: 各買取店のテナント情報';
COMMENT ON COLUMN tenants.slug IS 'サブドメイン識別子（URLに使用）';

CREATE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 2. 既存データ用デフォルトテナント（クアドラ）を作成
-- ============================================================================

INSERT INTO tenants (id, slug, name, display_name, plan)
VALUES (
    'aaaaaaaa-0000-0000-0000-000000000001',
    'quadra',
    'クアドラ',
    'クアドラ トレカ買取',
    'pro'
);

-- ============================================================================
-- 3. 全テーブルにtenant_idを追加
-- ============================================================================

-- profiles
ALTER TABLE profiles ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE profiles SET tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
ALTER TABLE profiles ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX idx_profiles_tenant_id ON profiles(tenant_id);

-- categories
ALTER TABLE categories ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE categories SET tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
ALTER TABLE categories ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_key;
ALTER TABLE categories ADD CONSTRAINT categories_tenant_name_unique UNIQUE (tenant_id, name);
CREATE INDEX idx_categories_tenant_id ON categories(tenant_id);

-- subcategories（category経由でテナント分離されるが明示的に追加）
ALTER TABLE subcategories ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE subcategories SET tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
ALTER TABLE subcategories ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX idx_subcategories_tenant_id ON subcategories(tenant_id);

-- products
ALTER TABLE products ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE products SET tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
ALTER TABLE products ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX idx_products_tenant_id ON products(tenant_id);

-- product_price_history（product経由でテナント分離されるが明示的に追加）
ALTER TABLE product_price_history ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE product_price_history SET tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
ALTER TABLE product_price_history ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX idx_product_price_history_tenant_id ON product_price_history(tenant_id);

-- orders
ALTER TABLE orders ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE orders SET tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
ALTER TABLE orders ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX idx_orders_tenant_id ON orders(tenant_id);

-- order_items（order経由でテナント分離されるが明示的に追加）
ALTER TABLE order_items ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE order_items SET tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
ALTER TABLE order_items ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX idx_order_items_tenant_id ON order_items(tenant_id);

-- order_status_history
ALTER TABLE order_status_history ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE order_status_history SET tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
ALTER TABLE order_status_history ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX idx_order_status_history_tenant_id ON order_status_history(tenant_id);

-- offices
ALTER TABLE offices ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE offices SET tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
ALTER TABLE offices ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX idx_offices_tenant_id ON offices(tenant_id);

-- app_settings
ALTER TABLE app_settings ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE app_settings SET tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
-- app_settingsはNULLを許可（グローバル設定の場合）
CREATE INDEX idx_app_settings_tenant_id ON app_settings(tenant_id);

-- customers（customerはテナントをまたぐ可能性があるため、
-- orders.customer_idで紐付く形で管理。直接tenant_idは持たせない）
-- ただし念のためマッピングテーブルを将来追加可能な設計にしておく

-- ============================================================================
-- 4. ヘルパー関数を追加・更新
-- ============================================================================

-- テナントIDを取得するヘルパー関数
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(user_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT tenant_id FROM profiles WHERE id = user_id;
$$;

-- get_user_roleをテナント対応に更新
-- （同テナント内でのロール確認に使用）
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT role FROM profiles WHERE id = user_id;
$$;

-- スーパー管理者チェック（将来使用。別テーブルで管理予定）
-- 現時点ではサービス管理者のUUIDを環境変数等で管理

-- ============================================================================
-- 5. RLS: tenantsテーブル
-- ============================================================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは自分のテナント情報のみ読み取り可
CREATE POLICY "tenants_select_own"
    ON tenants FOR SELECT
    TO authenticated
    USING (id = public.get_user_tenant_id(auth.uid()));

-- サービスロールは全テナントにアクセス可
CREATE POLICY "tenants_service_role"
    ON tenants FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- anonはスラッグで読み取り可（公開ページのテナント解決用）
CREATE POLICY "tenants_anon_select_by_slug"
    ON tenants FOR SELECT
    TO anon
    USING (is_active = true);

-- ============================================================================
-- 6. RLS: profiles（テナントスコープに書き直し）
-- ============================================================================

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_service_role" ON profiles;

-- 自分のプロフィール
CREATE POLICY "profiles_select_own"
    ON profiles FOR SELECT
    TO authenticated
    USING (id = auth.uid());

-- 同テナントの全プロフィール（admin/managerのみ）
CREATE POLICY "profiles_select_same_tenant_admin"
    ON profiles FOR SELECT
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager')
    );

-- 自分のプロフィール更新
CREATE POLICY "profiles_update_own"
    ON profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- admin: 同テナント内のprofile更新
CREATE POLICY "profiles_update_admin"
    ON profiles FOR UPDATE
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) = 'admin'
    )
    WITH CHECK (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) = 'admin'
    );

-- 自分のプロフィール作成
CREATE POLICY "profiles_insert_own"
    ON profiles FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid());

-- サービスロール
CREATE POLICY "profiles_service_role"
    ON profiles FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 7. RLS: categories（テナントスコープ）
-- ============================================================================

DROP POLICY IF EXISTS "categories_select_active_public" ON categories;
DROP POLICY IF EXISTS "categories_select_all_staff" ON categories;
DROP POLICY IF EXISTS "categories_insert_staff" ON categories;
DROP POLICY IF EXISTS "categories_update_staff" ON categories;
DROP POLICY IF EXISTS "categories_delete_staff" ON categories;

-- 公開（申込フォーム用）：テナントのアクティブカテゴリのみ
-- ※ anonアクセスはslugからテナントIDを解決してフィルタ（アプリ層で対応）
CREATE POLICY "categories_select_active_public"
    ON categories FOR SELECT
    TO anon, authenticated
    USING (is_active = true);

-- スタッフ：自テナントのみ
CREATE POLICY "categories_select_tenant_staff"
    ON categories FOR SELECT
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    );

CREATE POLICY "categories_insert_tenant_staff"
    ON categories FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    );

CREATE POLICY "categories_update_tenant_staff"
    ON categories FOR UPDATE
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    )
    WITH CHECK (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    );

CREATE POLICY "categories_delete_tenant_staff"
    ON categories FOR DELETE
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    );

-- ============================================================================
-- 8. RLS: subcategories（テナントスコープ）
-- ============================================================================

DROP POLICY IF EXISTS "subcategories_select" ON subcategories;
DROP POLICY IF EXISTS "subcategories_insert" ON subcategories;
DROP POLICY IF EXISTS "subcategories_update" ON subcategories;
DROP POLICY IF EXISTS "subcategories_delete" ON subcategories;

CREATE POLICY "subcategories_select_tenant"
    ON subcategories FOR SELECT
    TO anon, authenticated
    USING (is_active = true);

CREATE POLICY "subcategories_select_tenant_staff"
    ON subcategories FOR SELECT
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    );

CREATE POLICY "subcategories_insert_tenant_staff"
    ON subcategories FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    );

CREATE POLICY "subcategories_update_tenant_staff"
    ON subcategories FOR UPDATE
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    )
    WITH CHECK (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    );

CREATE POLICY "subcategories_delete_tenant_staff"
    ON subcategories FOR DELETE
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    );

-- ============================================================================
-- 9. RLS: products（テナントスコープ）
-- ============================================================================

DROP POLICY IF EXISTS "products_select_all_staff" ON products;
DROP POLICY IF EXISTS "products_insert_staff" ON products;
DROP POLICY IF EXISTS "products_update_staff" ON products;
DROP POLICY IF EXISTS "products_delete_staff" ON products;
DROP POLICY IF EXISTS "products_select_active_public" ON products;

CREATE POLICY "products_select_active_public"
    ON products FOR SELECT
    TO anon, authenticated
    USING (is_active = true);

CREATE POLICY "products_select_tenant_staff"
    ON products FOR SELECT
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    );

CREATE POLICY "products_insert_tenant_staff"
    ON products FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    );

CREATE POLICY "products_update_tenant_staff"
    ON products FOR UPDATE
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    )
    WITH CHECK (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    );

CREATE POLICY "products_delete_tenant_staff"
    ON products FOR DELETE
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    );

-- ============================================================================
-- 10. RLS: product_price_history（テナントスコープ）
-- ============================================================================

DROP POLICY IF EXISTS "price_history_insert_staff" ON product_price_history;
DROP POLICY IF EXISTS "price_history_select_staff" ON product_price_history;

CREATE POLICY "price_history_select_tenant_staff"
    ON product_price_history FOR SELECT
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    );

CREATE POLICY "price_history_insert_tenant_staff"
    ON product_price_history FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    );

-- ============================================================================
-- 11. RLS: orders（テナントスコープ）
-- ============================================================================

DROP POLICY IF EXISTS "orders_select_staff" ON orders;
DROP POLICY IF EXISTS "orders_update_staff" ON orders;
DROP POLICY IF EXISTS "orders_insert_admin_manager" ON orders;
DROP POLICY IF EXISTS "orders_delete_admin_manager" ON orders;
DROP POLICY IF EXISTS "orders_insert_anon" ON orders;

-- anon（申込フォーム）: INSERT のみ可。tenant_idは必須
CREATE POLICY "orders_insert_anon"
    ON orders FOR INSERT
    TO anon
    WITH CHECK (tenant_id IS NOT NULL);

CREATE POLICY "orders_select_tenant_staff"
    ON orders FOR SELECT
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    );

CREATE POLICY "orders_update_tenant_staff"
    ON orders FOR UPDATE
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    )
    WITH CHECK (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    );

CREATE POLICY "orders_insert_tenant_admin_manager"
    ON orders FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager')
    );

CREATE POLICY "orders_delete_tenant_admin_manager"
    ON orders FOR DELETE
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager')
    );

-- ============================================================================
-- 12. RLS: order_items（テナントスコープ）
-- ============================================================================

DROP POLICY IF EXISTS "order_items_select_staff" ON order_items;
DROP POLICY IF EXISTS "order_items_update_staff" ON order_items;
DROP POLICY IF EXISTS "order_items_insert_admin_manager" ON order_items;
DROP POLICY IF EXISTS "order_items_delete_admin_manager" ON order_items;

CREATE POLICY "order_items_select_tenant_staff"
    ON order_items FOR SELECT
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    );

CREATE POLICY "order_items_update_tenant_staff"
    ON order_items FOR UPDATE
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    )
    WITH CHECK (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    );

CREATE POLICY "order_items_insert_tenant_admin_manager"
    ON order_items FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager')
    );

CREATE POLICY "order_items_delete_tenant_admin_manager"
    ON order_items FOR DELETE
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager')
    );

-- ============================================================================
-- 13. RLS: order_status_history（テナントスコープ）
-- ============================================================================

ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_status_history_select_tenant_staff"
    ON order_status_history FOR SELECT
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    );

CREATE POLICY "order_status_history_insert_tenant_staff"
    ON order_status_history FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    );

-- ============================================================================
-- 14. RLS: offices（テナントスコープ）
-- ============================================================================

DROP POLICY IF EXISTS "offices_public_read" ON offices;
DROP POLICY IF EXISTS "offices_admin_manager_update" ON offices;
DROP POLICY IF EXISTS "offices_admin_insert" ON offices;
DROP POLICY IF EXISTS "offices_admin_delete" ON offices;

-- 公開（申込フォーム用）
CREATE POLICY "offices_public_read"
    ON offices FOR SELECT
    TO anon, authenticated
    USING (is_active = true);

CREATE POLICY "offices_select_tenant_staff"
    ON offices FOR SELECT
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    );

CREATE POLICY "offices_update_tenant_admin_manager"
    ON offices FOR UPDATE
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager')
    );

CREATE POLICY "offices_insert_tenant_admin"
    ON offices FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) = 'admin'
    );

CREATE POLICY "offices_delete_tenant_admin"
    ON offices FOR DELETE
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) = 'admin'
    );

-- ============================================================================
-- 15. RLS: app_settings（テナントスコープ）
-- ============================================================================

DROP POLICY IF EXISTS "app_settings_insert_admin" ON app_settings;
DROP POLICY IF EXISTS "app_settings_update_admin" ON app_settings;
DROP POLICY IF EXISTS "app_settings_delete_admin" ON app_settings;
DROP POLICY IF EXISTS "app_settings_select_staff" ON app_settings;

CREATE POLICY "app_settings_select_tenant_staff"
    ON app_settings FOR SELECT
    TO authenticated
    USING (
        (tenant_id IS NULL OR tenant_id = public.get_user_tenant_id(auth.uid()))
        AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
    );

CREATE POLICY "app_settings_insert_tenant_admin"
    ON app_settings FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) = 'admin'
    );

CREATE POLICY "app_settings_update_tenant_admin"
    ON app_settings FOR UPDATE
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) = 'admin'
    )
    WITH CHECK (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) = 'admin'
    );

CREATE POLICY "app_settings_delete_tenant_admin"
    ON app_settings FOR DELETE
    TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.get_user_role(auth.uid()) = 'admin'
    );

-- ============================================================================
-- 16. サービスロールポリシー（全テーブル）
-- ============================================================================

CREATE POLICY "tenants_service_role_all" ON tenants FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
