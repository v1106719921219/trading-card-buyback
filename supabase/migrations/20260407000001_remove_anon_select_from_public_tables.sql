-- ============================================================================
-- Migration: anon ロールからの直接参照を全面的に閉じる
-- Description: products, categories, subcategories, offices, tenants テーブルの
--   anon SELECT ポリシーを削除し、サーバーサイドAPI経由のみに制限する。
--   公開ページのデータ取得は /api/public/prices (service_role) を経由する。
--   注文投入も Server Action (adminClient) 経由のため orders の anon INSERT も削除。
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. products: anon SELECT を削除
-- ============================================================================
DROP POLICY IF EXISTS "products_select_active_public" ON products;

CREATE POLICY "products_select_active_authenticated"
    ON products FOR SELECT
    TO authenticated
    USING (is_active = true);

-- ============================================================================
-- 2. categories: anon SELECT を削除
-- ============================================================================
DROP POLICY IF EXISTS "categories_select_active_public" ON categories;

CREATE POLICY "categories_select_active_authenticated"
    ON categories FOR SELECT
    TO authenticated
    USING (is_active = true);

-- ============================================================================
-- 3. subcategories: anon SELECT を削除
-- ============================================================================
DROP POLICY IF EXISTS "subcategories_select_tenant" ON subcategories;

CREATE POLICY "subcategories_select_active_authenticated"
    ON subcategories FOR SELECT
    TO authenticated
    USING (is_active = true);

-- ============================================================================
-- 4. offices: anon SELECT を削除
-- ============================================================================
DROP POLICY IF EXISTS "offices_public_read" ON offices;

CREATE POLICY "offices_select_active_authenticated"
    ON offices FOR SELECT
    TO authenticated
    USING (is_active = true);

-- ============================================================================
-- 5. tenants: anon SELECT を削除（テナント解決は adminClient 経由で行う）
--    multi_tenant で作成 → super_admin で再作成されているため両方DROP
-- ============================================================================
DROP POLICY IF EXISTS "tenants_anon_select_by_slug" ON tenants;
DROP POLICY IF EXISTS "tenants_anon_select_active" ON tenants;

-- ============================================================================
-- 6. orders: anon INSERT を削除（注文作成は Server Action の adminClient 経由）
-- ============================================================================
DROP POLICY IF EXISTS "orders_insert_anon" ON orders;

-- ============================================================================
-- 7. super_admins: anon への不要な GRANT を取り消し
-- ============================================================================
REVOKE ALL ON TABLE public.super_admins FROM anon;

-- ============================================================================
-- 8. 全 public テーブルから anon の GRANT ALL を取り消し
--    (super_admin マイグレーションの一括 GRANT で付与されたもの)
--    RLS があるためポリシーなしでもアクセスはできないが、
--    将来うっかり anon ポリシーを追加した際のリスクを排除する。
-- ============================================================================
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
  END LOOP;
END;
$$;

COMMIT;
