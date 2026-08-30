-- 千葉DB用: eKYC基盤の一括適用（東京は適用済み）
-- 20260315000001〜000008 のeKYC基盤＋20260830000005 のeKYC連携をまとめて冪等に適用する

-- tenants.ekyc_enabled
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ekyc_enabled BOOLEAN NOT NULL DEFAULT false;

-- kyc_requests（書類種類は保険証・在留カード追加後の最終形）
CREATE TABLE IF NOT EXISTS kyc_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'approved', 'rejected', 'expired')),
  kyc_method TEXT NOT NULL DEFAULT 'image'
    CHECK (kyc_method IN ('image', 'ic_chip')),
  id_document_type TEXT NOT NULL
    CHECK (id_document_type IN ('driving_license', 'my_number_card', 'passport', 'health_insurance', 'residence_card')),
  id_front_image_path TEXT,
  id_back_image_path TEXT,
  id_thickness_image_path TEXT,
  face_image_path TEXT,
  ocr_result JSONB,
  ocr_extracted_name TEXT,
  ocr_extracted_address TEXT,
  ocr_extracted_birth_date TEXT,
  face_match_score FLOAT,
  face_match_passed BOOLEAN,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  upload_token_hash TEXT,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '90 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kyc_requests_tenant_id ON kyc_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_kyc_requests_customer_email ON kyc_requests(customer_email);
CREATE INDEX IF NOT EXISTS idx_kyc_requests_status ON kyc_requests(status);
CREATE INDEX IF NOT EXISTS idx_kyc_requests_created_at ON kyc_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kyc_requests_upload_token ON kyc_requests(upload_token_hash);

CREATE OR REPLACE FUNCTION update_kyc_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_kyc_requests_updated_at ON kyc_requests;
CREATE TRIGGER trigger_kyc_requests_updated_at
  BEFORE UPDATE ON kyc_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_kyc_requests_updated_at();

-- kyc_audit_logs
CREATE TABLE IF NOT EXISTS kyc_audit_logs (
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

CREATE INDEX IF NOT EXISTS idx_kyc_audit_logs_kyc_request_id ON kyc_audit_logs(kyc_request_id);
CREATE INDEX IF NOT EXISTS idx_kyc_audit_logs_tenant_id ON kyc_audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_kyc_audit_logs_created_at ON kyc_audit_logs(created_at DESC);

-- RLS（更新はstaffも可＝最終形）
ALTER TABLE kyc_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kyc_requests_select_own_tenant" ON kyc_requests;
CREATE POLICY "kyc_requests_select_own_tenant" ON kyc_requests
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND get_user_role(auth.uid()) IN ('admin', 'manager', 'staff')
  );

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

DROP POLICY IF EXISTS "kyc_audit_logs_select_own_tenant" ON kyc_audit_logs;
CREATE POLICY "kyc_audit_logs_select_own_tenant" ON kyc_audit_logs
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND get_user_role(auth.uid()) IN ('admin', 'manager')
  );

-- Storageバケット＋RLS（最終形のテナントスコープ読み取り）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kyc-documents',
  'kyc-documents',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "kyc_documents_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "kyc_documents_select_tenant" ON storage.objects;
CREATE POLICY "kyc_documents_select_tenant" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = (
      SELECT get_user_tenant_id(auth.uid())::text
    )
  );

-- 20260830000005 eKYC連携
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kyc_request_id UUID REFERENCES kyc_requests(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMPTZ;

UPDATE tenants SET ekyc_enabled = true;
