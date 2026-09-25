-- 価格表の表示/非表示の履歴を残す。
-- 過去価格リンク（/apply?pl=）で「その日オンだった商品」を復元するために使う。
-- 価格は product_price_history で巻き戻せるが、表示状態の履歴が無かったため
-- 夜間の一括オフ後にリンクを開くと商品が1件も出ないという問題があった。

CREATE TABLE IF NOT EXISTS product_visibility_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    old_visible BOOLEAN NOT NULL,
    new_visible BOOLEAN NOT NULL,
    changed_by UUID REFERENCES profiles(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
);

COMMENT ON TABLE product_visibility_history IS '価格表の表示/非表示の変更履歴（過去価格リンクでの商品復元に使用）';

-- 「基準時刻以降の最初の変更」を引く検索がホットパスなので複合インデックスを張る
CREATE INDEX IF NOT EXISTS product_visibility_history_tenant_changed_idx
    ON product_visibility_history (tenant_id, changed_at);
CREATE INDEX IF NOT EXISTS product_visibility_history_product_idx
    ON product_visibility_history (product_id, changed_at);

CREATE OR REPLACE FUNCTION record_visibility_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF OLD.show_in_price_list IS DISTINCT FROM NEW.show_in_price_list THEN
        INSERT INTO product_visibility_history (product_id, old_visible, new_visible, changed_by, tenant_id)
        VALUES (NEW.id, OLD.show_in_price_list, NEW.show_in_price_list, auth.uid(), NEW.tenant_id);
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION record_visibility_change() IS 'show_in_price_list の変更を product_visibility_history に記録する';

DROP TRIGGER IF EXISTS product_visibility_change_trigger ON products;
CREATE TRIGGER product_visibility_change_trigger
    AFTER UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION record_visibility_change();

ALTER TABLE product_visibility_history ENABLE ROW LEVEL SECURITY;

-- 参照はスタッフ以上（自テナントのみ）。書き込みはトリガー（SECURITY DEFINER）だけが行う
DROP POLICY IF EXISTS "product_visibility_history_select_staff" ON product_visibility_history;
CREATE POLICY "product_visibility_history_select_staff" ON product_visibility_history
    FOR SELECT TO authenticated
    USING (
        public.get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
        AND tenant_id = public.get_user_tenant_id(auth.uid())
    );
