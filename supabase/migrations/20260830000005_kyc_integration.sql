-- 本人確認のeKYC連携強化
-- 1) 注文に本人確認済みの記録を持たせる（承認済みeKYCとの紐付け）
-- 2) 書類種類に保険証・在留カードを追加
-- 3) eKYCを全テナントで有効化

ALTER TABLE orders ADD COLUMN IF NOT EXISTS kyc_request_id UUID REFERENCES kyc_requests(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMPTZ;

ALTER TABLE kyc_requests DROP CONSTRAINT IF EXISTS kyc_requests_id_document_type_check;
ALTER TABLE kyc_requests ADD CONSTRAINT kyc_requests_id_document_type_check
  CHECK (id_document_type IN ('driving_license', 'my_number_card', 'passport', 'health_insurance', 'residence_card'));

UPDATE tenants SET ekyc_enabled = true;

-- 検品時にスタッフも承認/否認できるようにする（実行者はreviewed_by＋監査ログに記録される）
DROP POLICY IF EXISTS "kyc_requests_update_admin" ON kyc_requests;
CREATE POLICY "kyc_requests_update_admin" ON kyc_requests
  FOR UPDATE TO authenticated
  USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
  )
  WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid())
    AND get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
  );
