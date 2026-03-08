-- ============================================================================
-- Migration: Super Admin
-- Description: サービス管理者（スーパー管理者）テーブルと認証
-- ============================================================================

BEGIN;

-- super_admins テーブル（テナントとは独立した管理者）
CREATE TABLE super_admins (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE super_admins IS 'SaaSプラットフォーム管理者（全テナントを管理）';

CREATE TRIGGER trg_super_admins_updated_at
    BEFORE UPDATE ON super_admins
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- テーブル権限付与
GRANT ALL ON TABLE public.super_admins TO postgres;
GRANT ALL ON TABLE public.super_admins TO service_role;
GRANT ALL ON TABLE public.super_admins TO authenticated;
GRANT ALL ON TABLE public.super_admins TO anon;

-- RLS
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admins_select_self"
    ON super_admins FOR SELECT
    TO authenticated
    USING (id = auth.uid());

CREATE POLICY "super_admins_service_role"
    ON super_admins FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- super_admin チェック関数
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM super_admins WHERE id = user_id
    );
$$;

-- tenantsテーブルのRLSを super_admin でも読み書き可能に更新
DROP POLICY IF EXISTS "tenants_select_own" ON tenants;
DROP POLICY IF EXISTS "tenants_anon_select_by_slug" ON tenants;
DROP POLICY IF EXISTS "tenants_service_role_all" ON tenants;

-- super_admin: 全テナントにアクセス可
CREATE POLICY "tenants_super_admin_all"
    ON tenants FOR ALL
    TO authenticated
    USING (public.is_super_admin(auth.uid()))
    WITH CHECK (public.is_super_admin(auth.uid()));

-- 通常ユーザー: 自テナントのみ読み取り
CREATE POLICY "tenants_select_own"
    ON tenants FOR SELECT
    TO authenticated
    USING (id = public.get_user_tenant_id(auth.uid()));

-- anon: アクティブなテナントを読み取り（申込フォーム用）
CREATE POLICY "tenants_anon_select_active"
    ON tenants FOR SELECT
    TO anon
    USING (is_active = true);

-- service role
CREATE POLICY "tenants_service_role_all"
    ON tenants FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMIT;
