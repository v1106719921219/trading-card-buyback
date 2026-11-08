-- 店舗 POS: 18 歳未満の保護者同意（docs/pos/design.md 3.1 節 4、5.2 節 store_identity_checks、10 章）。
-- 列は 20261107000003 で作ってあるので、ここでは「18 歳未満なら保護者の氏名・続柄・署名が必須」という制約だけ足す。
-- 既存行は 18 歳未満を記録していない（当初は断っていた）ので、NOT VALID は不要。
BEGIN;

ALTER TABLE public.store_identity_checks
  DROP CONSTRAINT IF EXISTS store_identity_checks_guardian_check;
ALTER TABLE public.store_identity_checks
  ADD CONSTRAINT store_identity_checks_guardian_check CHECK (
    age_at_check >= 18
    OR (guardian_name IS NOT NULL AND guardian_relation IS NOT NULL AND guardian_signature_path IS NOT NULL)
  );

COMMENT ON COLUMN public.store_identity_checks.guardian_name IS '18 歳未満のとき必須。立ち会った保護者（親権者）の氏名';
COMMENT ON COLUMN public.store_identity_checks.guardian_relation IS '18 歳未満のとき必須。続柄（父・母・その他の親権者／後見人）';
COMMENT ON COLUMN public.store_identity_checks.guardian_document_type IS '保護者の本人確認書類の種類（任意）';
COMMENT ON COLUMN public.store_identity_checks.guardian_image_path IS '保護者の本人確認書類の表面画像（任意。裏面は保存しない）';
COMMENT ON COLUMN public.store_identity_checks.guardian_signature_path IS '18 歳未満のとき必須。保護者の同意署名（PNG）';

COMMIT;
