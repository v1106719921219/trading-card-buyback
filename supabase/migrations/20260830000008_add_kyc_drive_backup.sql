-- eKYCのGoogleドライブバックアップ済み日時（古物台帳用）
-- 千葉などkyc_requestsが無いDBではスキップ
DO $$ BEGIN
  IF to_regclass('public.kyc_requests') IS NOT NULL THEN
    ALTER TABLE kyc_requests ADD COLUMN IF NOT EXISTS drive_backed_up_at timestamptz;
  END IF;
END $$;
