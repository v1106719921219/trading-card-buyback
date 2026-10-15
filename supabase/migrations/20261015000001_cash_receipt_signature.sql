BEGIN;
-- 現金手渡しの受領サイン（iPad署名画像）を支払記録に紐付ける
ALTER TABLE public.order_payments ADD COLUMN IF NOT EXISTS signature_path text;

-- 署名画像の保管バケット（非公開・service_role経由のみ）
INSERT INTO storage.buckets (id, name, public)
VALUES ('cash-receipts', 'cash-receipts', false)
ON CONFLICT (id) DO NOTHING;
COMMIT;
