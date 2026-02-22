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
