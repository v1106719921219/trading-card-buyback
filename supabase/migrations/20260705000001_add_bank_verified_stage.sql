-- 口座確認をどの段階で行ったかを記録（'発送済' = 振込予定時 / '検品完了' = 振込待ち時）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bank_verified_stage TEXT;

-- 既存のチェック済みデータは振込予定時の確認とみなす（警告が出る側）
UPDATE orders SET bank_verified_stage = '発送済' WHERE bank_verified = true AND bank_verified_stage IS NULL;
