-- アップロードトークン認証用カラム追加
ALTER TABLE kyc_requests ADD COLUMN IF NOT EXISTS upload_token_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_kyc_requests_upload_token ON kyc_requests(upload_token_hash);
