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
