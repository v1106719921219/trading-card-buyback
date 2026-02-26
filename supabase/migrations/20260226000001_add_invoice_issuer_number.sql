-- 適格請求書発行事業者番号カラムを追加
-- NULL = 事業者ではない、値あり（T+13桁） = 事業者
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_issuer_number TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS invoice_issuer_number TEXT;
