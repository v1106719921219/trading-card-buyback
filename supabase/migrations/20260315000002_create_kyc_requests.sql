-- eKYC本人確認リクエストテーブル
CREATE TABLE kyc_requests (
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
    CHECK (id_document_type IN ('driving_license', 'my_number_card', 'passport')),
  id_front_image_path TEXT,
  id_back_image_path TEXT,
  face_image_path TEXT,
  ocr_result JSONB,
  ocr_extracted_name TEXT,
  ocr_extracted_address TEXT,
  ocr_extracted_birth_date TEXT,
  face_match_score FLOAT,
  face_match_passed BOOLEAN,
  -- TODO [Phase2] jpki_verification_result JSONB（JPKI認可後に追加）
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '90 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX idx_kyc_requests_tenant_id ON kyc_requests(tenant_id);
CREATE INDEX idx_kyc_requests_customer_email ON kyc_requests(customer_email);
CREATE INDEX idx_kyc_requests_status ON kyc_requests(status);
CREATE INDEX idx_kyc_requests_created_at ON kyc_requests(created_at DESC);

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_kyc_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_kyc_requests_updated_at
  BEFORE UPDATE ON kyc_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_kyc_requests_updated_at();
