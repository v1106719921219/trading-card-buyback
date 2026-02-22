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
