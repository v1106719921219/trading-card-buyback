-- ============================================================================
-- Combined Migration: Full Schema for buyback-saas
-- Run this once on a fresh Supabase project
-- ============================================================================

-- ============================================================
-- Migration: 00001_initial_schema.sql
-- ============================================================
-- ============================================================================
-- Trading Card Buyback Management System - Initial Schema Migration
-- ============================================================================
-- This migration creates all tables, functions, triggers, RLS policies,
-- indexes, and seed data for the trading card buyback management system.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. TABLES
-- ============================================================================

-- --------------------------------------------------------------------------
-- profiles: extends auth.users with application-specific fields
-- --------------------------------------------------------------------------
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'staff')) DEFAULT 'staff',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE profiles IS 'Application user profiles extending Supabase auth.users';
COMMENT ON COLUMN profiles.role IS 'User role: admin, manager, or staff';

-- --------------------------------------------------------------------------
-- categories: product categories (e.g. card game titles)
-- --------------------------------------------------------------------------
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE categories IS 'Product categories for trading card games';

-- --------------------------------------------------------------------------
-- products: individual products within categories
-- --------------------------------------------------------------------------
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES categories(id),
    name TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (category_id, name)
);

COMMENT ON TABLE products IS 'Buyback products with prices in yen';
COMMENT ON COLUMN products.price IS 'Buyback price in Japanese yen';

-- --------------------------------------------------------------------------
-- product_price_history: audit trail for price changes
-- --------------------------------------------------------------------------
CREATE TABLE product_price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    old_price INTEGER NOT NULL,
    new_price INTEGER NOT NULL,
    changed_by UUID REFERENCES profiles(id),
    changed_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE product_price_history IS 'Audit log of product price changes';

-- --------------------------------------------------------------------------
-- orders: buyback orders from customers
-- --------------------------------------------------------------------------
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN (
        '申込',
        '発送済',
        '到着',
        '検品中',
        '検品完了',
        '振込済',
        'キャンセル'
    )) DEFAULT '申込',
    -- Customer information
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    customer_address TEXT,
    -- Bank account information for payment
    bank_name TEXT,
    bank_branch TEXT,
    bank_account_type TEXT CHECK (bank_account_type IN ('普通', '当座')),
    bank_account_number TEXT,
    bank_account_holder TEXT,
    -- Amounts
    total_amount INTEGER NOT NULL DEFAULT 0,
    inspected_total_amount INTEGER,
    -- Metadata
    notes TEXT,
    assigned_to UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE orders IS 'Buyback orders from customers';
COMMENT ON COLUMN orders.order_number IS 'Human-readable order number in BB-YYYYMMDD-NNNN format';
COMMENT ON COLUMN orders.status IS 'Order workflow status';
COMMENT ON COLUMN orders.total_amount IS 'Total buyback amount in yen (calculated from order_items)';
COMMENT ON COLUMN orders.inspected_total_amount IS 'Total amount after inspection (may differ from original)';

-- --------------------------------------------------------------------------
-- order_items: line items within an order
-- --------------------------------------------------------------------------
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    unit_price INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    inspected_quantity INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE order_items IS 'Line items within a buyback order';
COMMENT ON COLUMN order_items.product_name IS 'Snapshot of product name at order time';
COMMENT ON COLUMN order_items.unit_price IS 'Snapshot of unit price at order time (yen)';
COMMENT ON COLUMN order_items.inspected_quantity IS 'Actual quantity confirmed during inspection';

-- --------------------------------------------------------------------------
-- order_status_history: audit trail for order status changes
-- --------------------------------------------------------------------------
CREATE TABLE order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    old_status TEXT,
    new_status TEXT NOT NULL,
    changed_by UUID REFERENCES profiles(id),
    note TEXT,
    changed_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE order_status_history IS 'Audit log of order status transitions';

-- --------------------------------------------------------------------------
-- app_settings: application-wide key-value settings
-- --------------------------------------------------------------------------
CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE app_settings IS 'Application-wide configuration settings';


-- ============================================================================
-- 2. FUNCTIONS & TRIGGERS
-- ============================================================================

-- --------------------------------------------------------------------------
-- 2a. Auto-update updated_at timestamp
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION update_updated_at() IS 'Automatically sets updated_at to current timestamp on row update';

CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_app_settings_updated_at
    BEFORE UPDATE ON app_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- --------------------------------------------------------------------------
-- 2b. Auto-generate order_number (BB-YYYYMMDD-NNNN)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    today_str TEXT;
    today_count INTEGER;
    new_order_number TEXT;
BEGIN
    -- Format today's date as YYYYMMDD
    today_str := to_char(now() AT TIME ZONE 'Asia/Tokyo', 'YYYYMMDD');

    -- Count existing orders for today (based on order_number prefix)
    SELECT COUNT(*) INTO today_count
    FROM orders
    WHERE order_number LIKE 'BB-' || today_str || '-%';

    -- Generate the new order number: BB-YYYYMMDD-NNNN
    new_order_number := 'BB-' || today_str || '-' || lpad((today_count + 1)::TEXT, 4, '0');

    NEW.order_number = new_order_number;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION generate_order_number() IS 'Generates order number in BB-YYYYMMDD-NNNN format using daily counter';

CREATE TRIGGER trg_orders_generate_number
    BEFORE INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION generate_order_number();

-- --------------------------------------------------------------------------
-- 2c. Record price change history
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_price_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF OLD.price IS DISTINCT FROM NEW.price THEN
        INSERT INTO product_price_history (product_id, old_price, new_price, changed_by)
        VALUES (NEW.id, OLD.price, NEW.price, auth.uid());
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION record_price_change() IS 'Records product price changes to product_price_history';

CREATE TRIGGER trg_products_price_change
    AFTER UPDATE ON products
    FOR EACH ROW
    WHEN (OLD.price IS DISTINCT FROM NEW.price)
    EXECUTE FUNCTION record_price_change();

-- --------------------------------------------------------------------------
-- 2d. Record order status change history
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
        VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION record_status_change() IS 'Records order status transitions to order_status_history';

CREATE TRIGGER trg_orders_status_change
    AFTER UPDATE ON orders
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION record_status_change();

-- --------------------------------------------------------------------------
-- 2e. Recalculate order total amounts
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_order_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    target_order_id UUID;
    new_total INTEGER;
    new_inspected_total INTEGER;
    has_inspected BOOLEAN;
BEGIN
    -- Determine which order to recalculate
    IF TG_OP = 'DELETE' THEN
        target_order_id := OLD.order_id;
    ELSE
        target_order_id := NEW.order_id;
    END IF;

    -- Calculate the standard total: SUM(unit_price * quantity)
    SELECT COALESCE(SUM(unit_price * quantity), 0)
    INTO new_total
    FROM order_items
    WHERE order_id = target_order_id;

    -- Check if any item has an inspected_quantity set
    SELECT EXISTS(
        SELECT 1 FROM order_items
        WHERE order_id = target_order_id
          AND inspected_quantity IS NOT NULL
    ) INTO has_inspected;

    -- Calculate inspected total if any inspected quantities exist
    IF has_inspected THEN
        SELECT COALESCE(SUM(unit_price * COALESCE(inspected_quantity, quantity)), 0)
        INTO new_inspected_total
        FROM order_items
        WHERE order_id = target_order_id;
    ELSE
        new_inspected_total := NULL;
    END IF;

    -- Update the order totals
    UPDATE orders
    SET total_amount = new_total,
        inspected_total_amount = new_inspected_total
    WHERE id = target_order_id;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

COMMENT ON FUNCTION recalculate_order_total() IS 'Recalculates order total_amount and inspected_total_amount from order_items';

CREATE TRIGGER trg_order_items_recalc_total
    AFTER INSERT OR UPDATE OR DELETE ON order_items
    FOR EACH ROW
    EXECUTE FUNCTION recalculate_order_total();


-- ============================================================================
-- 3. INDEXES
-- ============================================================================

CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_orders_order_number ON orders (order_number);
CREATE INDEX idx_orders_created_at ON orders (created_at DESC);
CREATE INDEX idx_order_items_order_id ON order_items (order_id);
CREATE INDEX idx_products_category_id ON products (category_id);
CREATE INDEX idx_product_price_history_product_id ON product_price_history (product_id);
CREATE INDEX idx_order_status_history_order_id ON order_status_history (order_id);


-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- 4a. profiles policies
-- --------------------------------------------------------------------------

-- Users can read their own profile
CREATE POLICY "profiles_select_own"
    ON profiles FOR SELECT
    TO authenticated
    USING (id = auth.uid());

-- Admin can read all profiles
CREATE POLICY "profiles_select_admin"
    ON profiles FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );

-- Users can update their own profile
CREATE POLICY "profiles_update_own"
    ON profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Admin can update any profile
CREATE POLICY "profiles_update_admin"
    ON profiles FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );

-- Allow insert for new user profiles (needed during signup)
CREATE POLICY "profiles_insert_own"
    ON profiles FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid());

-- Service role bypass (implicit via supabase, but explicit for clarity)
CREATE POLICY "profiles_service_role"
    ON profiles FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- --------------------------------------------------------------------------
-- 4b. categories policies
-- --------------------------------------------------------------------------

-- Public (anon + authenticated) can read active categories
CREATE POLICY "categories_select_active_public"
    ON categories FOR SELECT
    TO anon, authenticated
    USING (is_active = true);

-- Authenticated staff can read all categories (including inactive)
CREATE POLICY "categories_select_all_staff"
    ON categories FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager', 'staff')
        )
    );

-- Authenticated staff can insert categories
CREATE POLICY "categories_insert_staff"
    ON categories FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager', 'staff')
        )
    );

-- Authenticated staff can update categories
CREATE POLICY "categories_update_staff"
    ON categories FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager', 'staff')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager', 'staff')
        )
    );

-- Authenticated staff can delete categories
CREATE POLICY "categories_delete_staff"
    ON categories FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager', 'staff')
        )
    );

-- Service role bypass
CREATE POLICY "categories_service_role"
    ON categories FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- --------------------------------------------------------------------------
-- 4c. products policies
-- --------------------------------------------------------------------------

-- Public (anon + authenticated) can read active products
CREATE POLICY "products_select_active_public"
    ON products FOR SELECT
    TO anon, authenticated
    USING (is_active = true);

-- Authenticated staff can read all products (including inactive)
CREATE POLICY "products_select_all_staff"
    ON products FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager', 'staff')
        )
    );

-- Authenticated staff can insert products
CREATE POLICY "products_insert_staff"
    ON products FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager', 'staff')
        )
    );

-- Authenticated staff can update products
CREATE POLICY "products_update_staff"
    ON products FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager', 'staff')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager', 'staff')
        )
    );

-- Authenticated staff can delete products
CREATE POLICY "products_delete_staff"
    ON products FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager', 'staff')
        )
    );

-- Service role bypass
CREATE POLICY "products_service_role"
    ON products FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- --------------------------------------------------------------------------
-- 4d. orders policies
-- --------------------------------------------------------------------------

-- Authenticated staff can select orders
CREATE POLICY "orders_select_staff"
    ON orders FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager', 'staff')
        )
    );

-- Authenticated staff can update orders
CREATE POLICY "orders_update_staff"
    ON orders FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager', 'staff')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager', 'staff')
        )
    );

-- Only admin/manager can insert orders
CREATE POLICY "orders_insert_admin_manager"
    ON orders FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager')
        )
    );

-- Only admin/manager can delete orders
CREATE POLICY "orders_delete_admin_manager"
    ON orders FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager')
        )
    );

-- Service role bypass
CREATE POLICY "orders_service_role"
    ON orders FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- --------------------------------------------------------------------------
-- 4e. order_items policies
-- --------------------------------------------------------------------------

-- Authenticated staff can select order items
CREATE POLICY "order_items_select_staff"
    ON order_items FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager', 'staff')
        )
    );

-- Authenticated staff can update order items
CREATE POLICY "order_items_update_staff"
    ON order_items FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager', 'staff')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager', 'staff')
        )
    );

-- Only admin/manager can insert order items
CREATE POLICY "order_items_insert_admin_manager"
    ON order_items FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager')
        )
    );

-- Only admin/manager can delete order items
CREATE POLICY "order_items_delete_admin_manager"
    ON order_items FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager')
        )
    );

-- Service role bypass
CREATE POLICY "order_items_service_role"
    ON order_items FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- --------------------------------------------------------------------------
-- 4f. order_status_history policies
-- --------------------------------------------------------------------------

-- Authenticated users can read status history
CREATE POLICY "order_status_history_select_authenticated"
    ON order_status_history FOR SELECT
    TO authenticated
    USING (true);

-- Authenticated users can insert (for trigger-based inserts and manual entries)
CREATE POLICY "order_status_history_insert_authenticated"
    ON order_status_history FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Service role bypass
CREATE POLICY "order_status_history_service_role"
    ON order_status_history FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- --------------------------------------------------------------------------
-- 4g. product_price_history policies
-- --------------------------------------------------------------------------

-- Authenticated users can read price history
CREATE POLICY "product_price_history_select_authenticated"
    ON product_price_history FOR SELECT
    TO authenticated
    USING (true);

-- Authenticated users can insert (for trigger-based inserts and manual entries)
CREATE POLICY "product_price_history_insert_authenticated"
    ON product_price_history FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Service role bypass
CREATE POLICY "product_price_history_service_role"
    ON product_price_history FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- --------------------------------------------------------------------------
-- 4h. app_settings policies
-- --------------------------------------------------------------------------

-- Authenticated users can read settings
CREATE POLICY "app_settings_select_authenticated"
    ON app_settings FOR SELECT
    TO authenticated
    USING (true);

-- Only admin can insert settings
CREATE POLICY "app_settings_insert_admin"
    ON app_settings FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );

-- Only admin can update settings
CREATE POLICY "app_settings_update_admin"
    ON app_settings FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );

-- Only admin can delete settings
CREATE POLICY "app_settings_delete_admin"
    ON app_settings FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );

-- Service role bypass
CREATE POLICY "app_settings_service_role"
    ON app_settings FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


-- ============================================================================
-- 5. SEED DATA
-- ============================================================================

-- --------------------------------------------------------------------------
-- 5a. Application settings
-- --------------------------------------------------------------------------
INSERT INTO app_settings (key, value, description) VALUES
    ('site_name', '買取スクエア', 'サイト名'),
    ('site_description', 'トレーディングカード高価買取', 'サイト説明');

-- --------------------------------------------------------------------------
-- 5b. Default categories
-- --------------------------------------------------------------------------
INSERT INTO categories (name, sort_order) VALUES
    ('ポケモンカード', 1),
    ('遊戯王', 2),
    ('ワンピースカード', 3),
    ('デュエルマスターズ', 4),
    ('ヴァイスシュヴァルツ', 5);


COMMIT;

-- ============================================================
-- Migration: 00002_fix_rls_recursion.sql
-- ============================================================
-- Fix infinite recursion in profiles RLS policies
-- The issue: profiles policies that check role via subquery on profiles itself cause infinite recursion

BEGIN;

-- Create a security definer function to check user role without triggering RLS
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM profiles WHERE id = user_id;
$$;

-- Drop the problematic profiles policies
DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;

-- Recreate: admin can read all profiles (using the helper function, no recursion)
CREATE POLICY "profiles_select_admin"
    ON profiles FOR SELECT
    TO authenticated
    USING (public.get_user_role(auth.uid()) = 'admin');

-- Recreate: admin can update any profile
CREATE POLICY "profiles_update_admin"
    ON profiles FOR UPDATE
    TO authenticated
    USING (public.get_user_role(auth.uid()) = 'admin')
    WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- Now also fix all other tables that reference profiles in their RLS policies
-- to use the helper function instead of subqueries (more efficient, no risk of issues)

-- categories
DROP POLICY IF EXISTS "categories_select_all_staff" ON categories;
DROP POLICY IF EXISTS "categories_insert_staff" ON categories;
DROP POLICY IF EXISTS "categories_update_staff" ON categories;
DROP POLICY IF EXISTS "categories_delete_staff" ON categories;

CREATE POLICY "categories_select_all_staff"
    ON categories FOR SELECT
    TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'));

CREATE POLICY "categories_insert_staff"
    ON categories FOR INSERT
    TO authenticated
    WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'));

CREATE POLICY "categories_update_staff"
    ON categories FOR UPDATE
    TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'))
    WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'));

CREATE POLICY "categories_delete_staff"
    ON categories FOR DELETE
    TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'));

-- products
DROP POLICY IF EXISTS "products_select_all_staff" ON products;
DROP POLICY IF EXISTS "products_insert_staff" ON products;
DROP POLICY IF EXISTS "products_update_staff" ON products;
DROP POLICY IF EXISTS "products_delete_staff" ON products;

CREATE POLICY "products_select_all_staff"
    ON products FOR SELECT
    TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'));

CREATE POLICY "products_insert_staff"
    ON products FOR INSERT
    TO authenticated
    WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'));

CREATE POLICY "products_update_staff"
    ON products FOR UPDATE
    TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'))
    WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'));

CREATE POLICY "products_delete_staff"
    ON products FOR DELETE
    TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'));

-- orders
DROP POLICY IF EXISTS "orders_select_staff" ON orders;
DROP POLICY IF EXISTS "orders_update_staff" ON orders;
DROP POLICY IF EXISTS "orders_insert_admin_manager" ON orders;
DROP POLICY IF EXISTS "orders_delete_admin_manager" ON orders;

CREATE POLICY "orders_select_staff"
    ON orders FOR SELECT
    TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'));

CREATE POLICY "orders_update_staff"
    ON orders FOR UPDATE
    TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'))
    WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'));

CREATE POLICY "orders_insert_admin_manager"
    ON orders FOR INSERT
    TO authenticated
    WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "orders_delete_admin_manager"
    ON orders FOR DELETE
    TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin', 'manager'));

-- order_items
DROP POLICY IF EXISTS "order_items_select_staff" ON order_items;
DROP POLICY IF EXISTS "order_items_update_staff" ON order_items;
DROP POLICY IF EXISTS "order_items_insert_admin_manager" ON order_items;
DROP POLICY IF EXISTS "order_items_delete_admin_manager" ON order_items;

CREATE POLICY "order_items_select_staff"
    ON order_items FOR SELECT
    TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'));

CREATE POLICY "order_items_update_staff"
    ON order_items FOR UPDATE
    TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'))
    WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'));

CREATE POLICY "order_items_insert_admin_manager"
    ON order_items FOR INSERT
    TO authenticated
    WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "order_items_delete_admin_manager"
    ON order_items FOR DELETE
    TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin', 'manager'));

-- app_settings
DROP POLICY IF EXISTS "app_settings_insert_admin" ON app_settings;
DROP POLICY IF EXISTS "app_settings_update_admin" ON app_settings;
DROP POLICY IF EXISTS "app_settings_delete_admin" ON app_settings;

CREATE POLICY "app_settings_insert_admin"
    ON app_settings FOR INSERT
    TO authenticated
    WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "app_settings_update_admin"
    ON app_settings FOR UPDATE
    TO authenticated
    USING (public.get_user_role(auth.uid()) = 'admin')
    WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "app_settings_delete_admin"
    ON app_settings FOR DELETE
    TO authenticated
    USING (public.get_user_role(auth.uid()) = 'admin');

COMMIT;

-- ============================================================
-- Migration: 00003_customer_accounts.sql
-- ============================================================
-- Customer accounts for magic link authentication
-- Stores customer profile so they don't need to re-enter info

BEGIN;

-- Customer profiles (linked to auth.users)
CREATE TABLE customers (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    phone TEXT DEFAULT '',
    address TEXT DEFAULT '',
    bank_name TEXT DEFAULT '',
    bank_branch TEXT DEFAULT '',
    bank_account_type TEXT CHECK (bank_account_type IN ('普通', '当座')) DEFAULT '普通',
    bank_account_number TEXT DEFAULT '',
    bank_account_holder TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto update updated_at
CREATE TRIGGER customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add customer_id to orders to link repeat customers
ALTER TABLE orders ADD COLUMN customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX idx_orders_customer_id ON orders (customer_id);

-- RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Customers can read/update their own record
CREATE POLICY "customers_select_own"
    ON customers FOR SELECT
    TO authenticated
    USING (id = auth.uid());

CREATE POLICY "customers_update_own"
    ON customers FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

CREATE POLICY "customers_insert_own"
    ON customers FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid());

-- Staff can view customers
CREATE POLICY "customers_select_staff"
    ON customers FOR SELECT
    TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'));

-- Service role full access
CREATE POLICY "customers_service_role"
    ON customers FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMIT;

-- ============================================================
-- Migration: 00004_offices.sql
-- ============================================================
-- ============================================================================
-- Migration: 00004_offices
-- Description: 発送先事務所の選択機能
-- ============================================================================

-- offices テーブル作成
CREATE TABLE offices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  postal_code TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at トリガー
CREATE TRIGGER update_offices_updated_at
  BEFORE UPDATE ON offices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- シードデータ（ダミー住所）
INSERT INTO offices (name, postal_code, address, phone, sort_order) VALUES
  ('東京事務所', '100-0001', '東京都千代田区千代田1-1-1 サンプルビル3F', '03-0000-0000', 1),
  ('山口事務所', '750-0001', '山口県下関市大字関1-1-1 サンプルビル2F', '083-000-0000', 2);

-- orders テーブルに office_id カラム追加
ALTER TABLE orders ADD COLUMN office_id UUID REFERENCES offices(id);

-- インデックス
CREATE INDEX idx_offices_is_active ON offices(is_active);
CREATE INDEX idx_orders_office_id ON orders(office_id);

-- ============================================================================
-- RLS ポリシー
-- ============================================================================
ALTER TABLE offices ENABLE ROW LEVEL SECURITY;

-- 公開読み取り（申込フォームから参照するため、anon含む全ユーザーが読み取り可）
CREATE POLICY "offices_public_read" ON offices
  FOR SELECT
  USING (true);

-- admin/manager のみ更新可
CREATE POLICY "offices_admin_manager_update" ON offices
  FOR UPDATE
  USING (get_user_role(auth.uid()) IN ('admin', 'manager'));

-- admin のみ挿入・削除可
CREATE POLICY "offices_admin_insert" ON offices
  FOR INSERT
  WITH CHECK (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "offices_admin_delete" ON offices
  FOR DELETE
  USING (get_user_role(auth.uid()) = 'admin');

-- ============================================================
-- Migration: 00005_tracking_number.sql
-- ============================================================
-- Add tracking_number column to orders table
ALTER TABLE orders ADD COLUMN tracking_number TEXT;

-- ============================================================
-- Migration: 00006_customer_prefecture.sql
-- ============================================================
ALTER TABLE orders ADD COLUMN customer_prefecture TEXT;

-- ============================================================
-- Migration: 00007_show_in_price_list.sql
-- ============================================================
-- Add show_in_price_list column to products (default true for existing products)
ALTER TABLE products ADD COLUMN show_in_price_list BOOLEAN NOT NULL DEFAULT true;

-- Products with price 0 should default to not showing
UPDATE products SET show_in_price_list = false WHERE price = 0;

-- ============================================================
-- Migration: 00008_product_sort_order.sql
-- ============================================================
-- Add sort_order column to products
ALTER TABLE products ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Initialize sort_order based on current name order within each category
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY name) AS rn
  FROM products
)
UPDATE products SET sort_order = ranked.rn FROM ranked WHERE products.id = ranked.id;

-- ============================================================
-- Migration: 00009_subcategories.sql
-- ============================================================
-- Create subcategories table
CREATE TABLE subcategories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (category_id, name)
);

-- Add updated_at trigger
CREATE TRIGGER trg_subcategories_updated_at
    BEFORE UPDATE ON subcategories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add subcategory_id to products (nullable for backwards compatibility)
ALTER TABLE products ADD COLUMN subcategory_id UUID REFERENCES subcategories(id) ON DELETE SET NULL;

-- RLS policies for subcategories
ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subcategories_select_staff"
    ON subcategories FOR SELECT
    TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'));

CREATE POLICY "subcategories_insert_staff"
    ON subcategories FOR INSERT
    TO authenticated
    WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'));

CREATE POLICY "subcategories_update_staff"
    ON subcategories FOR UPDATE
    TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'))
    WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'));

CREATE POLICY "subcategories_delete_staff"
    ON subcategories FOR DELETE
    TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'));

-- Public read for price list / apply form
CREATE POLICY "subcategories_select_anon"
    ON subcategories FOR SELECT
    TO anon
    USING (is_active = true);

-- Seed subcategories
INSERT INTO subcategories (category_id, name, sort_order)
SELECT c.id, s.name, s.sort_order
FROM categories c
CROSS JOIN (VALUES
    ('シュリンク付きBOX', 1),
    ('シュリンク無しBOX', 2),
    ('カートン', 3),
    ('スペシャルボックス', 4),
    ('パック', 5),
    ('シングルカード', 6),
    ('鑑定品', 7)
) AS s(name, sort_order)
WHERE c.name = 'ポケモンカード';

INSERT INTO subcategories (category_id, name, sort_order)
SELECT c.id, s.name, s.sort_order
FROM categories c
CROSS JOIN (VALUES
    ('BOX', 1),
    ('カートン', 2),
    ('パック', 3),
    ('シングルカード', 4),
    ('鑑定品', 5)
) AS s(name, sort_order)
WHERE c.name = 'ワンピースカード';

-- ============================================================
-- Migration: 00010_add_payment_verified_status.sql
-- ============================================================
-- Add '振込確認済' to orders status check constraint
ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN (
    '申込',
    '発送済',
    '到着',
    '検品中',
    '検品完了',
    '振込済',
    '振込確認済',
    'キャンセル'
));

-- ============================================================
-- Migration: 00011_returned_quantity.sql
-- ============================================================
-- Add returned_quantity to order_items
ALTER TABLE order_items ADD COLUMN returned_quantity INTEGER DEFAULT 0;

-- ============================================================
-- Migration: 00012_return_columns.sql
-- ============================================================
-- 返品管理用カラム追加
-- return_status: null=返品なし、'返送待ち'=返品あり未返送、'返送済'=返送完了
-- return_tracking_number: 返送時の追跡番号

ALTER TABLE orders ADD COLUMN return_status TEXT CHECK (return_status IN ('返送待ち', '返送済'));
ALTER TABLE orders ADD COLUMN return_tracking_number TEXT;

-- ============================================================
-- Migration: 00013_restrict_history_insert.sql
-- ============================================================
-- order_status_history: INSERT をスタッフ以上に制限
DROP POLICY IF EXISTS "order_status_history_insert_authenticated" ON order_status_history;
CREATE POLICY "order_status_history_insert_staff" ON order_status_history
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'));

-- product_price_history: INSERT をスタッフ以上に制限
DROP POLICY IF EXISTS "product_price_history_insert_authenticated" ON product_price_history;
CREATE POLICY "product_price_history_insert_staff" ON product_price_history
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff'));

-- ============================================================
-- Migration: 00014_add_customer_fields.sql
-- ============================================================
-- Add fields for identity verification (古物商法 compliance)

-- orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_line_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_birth_date DATE,
  ADD COLUMN IF NOT EXISTS customer_occupation TEXT,
  ADD COLUMN IF NOT EXISTS customer_not_invoice_issuer BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_identity_method TEXT;

-- customers table (for returning customer profile)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS line_name TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS occupation TEXT,
  ADD COLUMN IF NOT EXISTS not_invoice_issuer BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS identity_method TEXT;

-- ============================================================
-- Migration: 00015_inspection_discount_notes.sql
-- ============================================================
-- 検品時の減額と検品メモカラムを追加
ALTER TABLE orders ADD COLUMN inspection_discount integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN inspection_notes text;

-- ============================================================
-- Migration: 00016_bank_verified.sql
-- ============================================================
-- 口座確認済みフラグを追加
ALTER TABLE orders ADD COLUMN bank_verified boolean NOT NULL DEFAULT false;

-- ============================================================
-- Migration: 00017_payment_checked.sql
-- ============================================================
-- 振込チェック済みフラグを追加
ALTER TABLE orders ADD COLUMN payment_checked boolean NOT NULL DEFAULT false;

-- ============================================================
-- Migration: 00018_shipped_date.sql
-- ============================================================
-- お客様が入力する発送日を追加
ALTER TABLE orders ADD COLUMN shipped_date DATE;

-- ============================================================
-- Migration: 00019_preserve_price_history.sql
-- ============================================================
-- 商品削除時に価格履歴が連鎖削除されないようにする
ALTER TABLE product_price_history
  DROP CONSTRAINT product_price_history_product_id_fkey;

ALTER TABLE product_price_history
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE product_price_history
  ADD CONSTRAINT product_price_history_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

-- ============================================================
-- Migration: 00020_staff_order_items_permissions.sql
-- ============================================================
-- staffにもorder_itemsのINSERT/DELETEを許可（検品時の商品追加・削除のため）
DROP POLICY "order_items_insert_admin_manager" ON order_items;
CREATE POLICY "order_items_insert_staff"
    ON order_items FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager', 'staff')
        )
    );

DROP POLICY "order_items_delete_admin_manager" ON order_items;
CREATE POLICY "order_items_delete_staff"
    ON order_items FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'manager', 'staff')
        )
    );

-- ============================================================
-- Migration: 00021_fix_order_number_generation.sql
-- ============================================================
-- 注文削除後に番号が重複する問題を修正
-- COUNT → MAX に変更して、既存の最大番号の次を採番する
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

    -- 今日の最大番号を取得
    SELECT COALESCE(MAX(
      CAST(SUBSTRING(order_number FROM 'BB-' || today_str || '-(\d+)') AS INTEGER)
    ), 0) INTO max_number
    FROM orders
    WHERE order_number LIKE 'BB-' || today_str || '-%';

    new_order_number := 'BB-' || today_str || '-' || lpad((max_number + 1)::TEXT, 4, '0');

    NEW.order_number = new_order_number;
    RETURN NEW;
END;
$$;

-- ============================================================
-- Migration: 00022_buyback_type.sql
-- ============================================================
-- 買取種別カラム追加（AR美品 / 最低保証）
ALTER TABLE orders ADD COLUMN buyback_type TEXT;

-- CHECK制約: 許可される値のみ
ALTER TABLE orders ADD CONSTRAINT orders_buyback_type_check
  CHECK (buyback_type IS NULL OR buyback_type IN ('ar_quality', 'minimum_guarantee'));

-- ============================================================
-- Migration: 20260225201808_remote_commit.sql
-- ============================================================
drop extension if exists "pg_net";



-- ============================================================
-- Migration: 20260226000001_add_invoice_issuer_number.sql
-- ============================================================
-- 適格請求書発行事業者番号カラムを追加
-- NULL = 事業者ではない、値あり（T+13桁） = 事業者
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_issuer_number TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS invoice_issuer_number TEXT;

-- ============================================================
-- Migration: 20260307000001_multi_tenant.sql
-- ============================================================
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

-- ============================================================
-- Migration: 20260307000002_super_admin.sql
-- ============================================================
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
