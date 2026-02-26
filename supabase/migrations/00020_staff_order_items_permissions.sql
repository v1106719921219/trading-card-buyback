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
