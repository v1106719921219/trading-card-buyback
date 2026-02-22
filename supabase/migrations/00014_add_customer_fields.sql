-- Add fields for identity verification (古物商法 compliance)

-- orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_line_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_birth_date DATE,
  ADD COLUMN IF NOT EXISTS customer_occupation TEXT,
  ADD COLUMN IF NOT EXISTS customer_not_invoice_issuer BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_identity_method TEXT;

-- customers table (for returning customer profile)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS line_name TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS occupation TEXT,
  ADD COLUMN IF NOT EXISTS not_invoice_issuer BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS identity_method TEXT;
