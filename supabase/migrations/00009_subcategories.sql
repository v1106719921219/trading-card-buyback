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
