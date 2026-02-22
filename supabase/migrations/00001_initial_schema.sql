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
