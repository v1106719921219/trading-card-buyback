-- kyc_requests テーブルのRLSポリシー
ALTER TABLE kyc_requests ENABLE ROW LEVEL SECURITY;

-- service_role は全操作許可（デフォルトでRLSバイパス）

-- authenticated: テナント内のSELECT
CREATE POLICY "kyc_requests_select_own_tenant" ON kyc_requests
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
  );

-- authenticated: admin/manager のみ UPDATE（承認/否認）
CREATE POLICY "kyc_requests_update_admin" ON kyc_requests
  FOR UPDATE TO authenticated
  USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND get_user_role(auth.uid()) IN ('admin', 'manager')
  )
  WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid())
    AND get_user_role(auth.uid()) IN ('admin', 'manager')
  );

-- anon の直接アクセスは不可（API Route 経由で adminClient を使用）
-- INSERT / DELETE は service_role（adminClient）のみ

-- kyc_audit_logs テーブルのRLSポリシー
ALTER TABLE kyc_audit_logs ENABLE ROW LEVEL SECURITY;

-- authenticated: テナント内のSELECTのみ
CREATE POLICY "kyc_audit_logs_select_own_tenant" ON kyc_audit_logs
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND get_user_role(auth.uid()) IN ('admin', 'manager')
  );

-- INSERT / DELETE は service_role（adminClient）のみ
