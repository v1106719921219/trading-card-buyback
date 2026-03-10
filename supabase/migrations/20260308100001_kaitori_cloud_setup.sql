-- ============================================================================
-- Migration: カイトリクラウド統合準備
-- Description:
--   1. tenants テーブルに contact_email, site_name カラム追加
--   2. orders の UNIQUE 制約を (tenant_id, order_number) に変更
--   3. generate_order_number() をテナントスコープ化
--   4. chiba テナント追加 + quadra テナント情報更新
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. tenants テーブルにカラム追加
-- ============================================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS site_name TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_email TEXT;

COMMENT ON COLUMN tenants.site_name IS 'サイト表示名（ヘッダー/フッター/PDF等に使用）';
COMMENT ON COLUMN tenants.contact_email IS 'お問い合わせ用メールアドレス';

-- ============================================================================
-- 2. 既存テナント（quadra）の情報を更新
-- ============================================================================

UPDATE tenants SET
    site_name = '買取スクエア',
    contact_email = 'email@kaitorisquare.com',
    ancient_dealer_number = '山口県公安委員会許可 第741091000629号'
WHERE slug = 'quadra';

-- ============================================================================
-- 3. chiba テナント追加
-- ============================================================================

INSERT INTO tenants (id, slug, name, display_name, site_name, contact_email, ancient_dealer_number, plan)
VALUES (
    'bbbbbbbb-0000-0000-0000-000000000002',
    'chiba',
    '買取スクエア千葉',
    '買取スクエア 千葉',
    '買取スクエア 千葉',
    'chiba@kaitorisquare.com',
    '千葉県公安委員会許可 第441050002610号',
    'pro'
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    display_name = EXCLUDED.display_name,
    site_name = EXCLUDED.site_name,
    contact_email = EXCLUDED.contact_email,
    ancient_dealer_number = EXCLUDED.ancient_dealer_number;

-- ============================================================================
-- 4. orders の UNIQUE 制約を (tenant_id, order_number) に変更
-- ============================================================================

-- 既存の order_number UNIQUE 制約を削除
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_number_key;
DROP INDEX IF EXISTS orders_order_number_key;

-- テナントスコープの UNIQUE 制約を追加
ALTER TABLE orders ADD CONSTRAINT orders_tenant_order_number_unique
    UNIQUE (tenant_id, order_number);

-- ============================================================================
-- 5. generate_order_number() をテナントスコープ化
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    today_str TEXT;
    max_number INTEGER;
    new_order_number TEXT;
BEGIN
    today_str := to_char(now() AT TIME ZONE 'Asia/Tokyo', 'YYYYMMDD');

    -- テナント内の今日の最大番号を取得
    SELECT COALESCE(MAX(
      CAST(SUBSTRING(order_number FROM 'BB-' || today_str || '-(\d+)') AS INTEGER)
    ), 0) INTO max_number
    FROM orders
    WHERE order_number LIKE 'BB-' || today_str || '-%'
      AND tenant_id = NEW.tenant_id;

    new_order_number := 'BB-' || today_str || '-' || lpad((max_number + 1)::TEXT, 4, '0');

    NEW.order_number = new_order_number;
    RETURN NEW;
END;
$$;

COMMIT;
