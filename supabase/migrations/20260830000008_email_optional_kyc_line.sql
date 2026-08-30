-- メール入力を廃止（LINE一本化）。customer_email を任意化し、eKYC照合を line_user_id へ移行
ALTER TABLE orders ALTER COLUMN customer_email DROP NOT NULL;
ALTER TABLE kyc_requests ALTER COLUMN customer_email DROP NOT NULL;
-- eKYCをLINE本人で照合するための列
ALTER TABLE kyc_requests ADD COLUMN IF NOT EXISTS line_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_kyc_requests_line_user_id ON kyc_requests (line_user_id);
