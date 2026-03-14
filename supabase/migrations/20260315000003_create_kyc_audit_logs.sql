-- eKYC監査ログテーブル
-- TODO [Phase2] ログ改ざん防止・5年保管（認定対応）
CREATE TABLE kyc_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kyc_request_id UUID NOT NULL REFERENCES kyc_requests(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX idx_kyc_audit_logs_kyc_request_id ON kyc_audit_logs(kyc_request_id);
CREATE INDEX idx_kyc_audit_logs_tenant_id ON kyc_audit_logs(tenant_id);
CREATE INDEX idx_kyc_audit_logs_created_at ON kyc_audit_logs(created_at DESC);
