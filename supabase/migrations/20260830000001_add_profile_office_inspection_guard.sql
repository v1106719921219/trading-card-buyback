-- スタッフに所属事務所を追加し、検品完了への変更を
-- 「その注文の担当事務所に所属するアカウント」または「admin」のみに制限する

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS office_id UUID REFERENCES offices(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION enforce_inspection_completion_office()
RETURNS TRIGGER AS $$
DECLARE
  v_uid UUID;
  v_role TEXT;
  v_office UUID;
BEGIN
  IF NEW.status = '検品完了' AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_uid := auth.uid();
    -- service role等のシステム処理(auth.uidなし)は許可
    IF v_uid IS NOT NULL THEN
      SELECT role, office_id INTO v_role, v_office FROM profiles WHERE id = v_uid;
      IF v_role IS DISTINCT FROM 'admin'
         AND (v_office IS NULL OR v_office IS DISTINCT FROM NEW.office_id) THEN
        RAISE EXCEPTION '検品完了にできるのは、この注文の担当事務所に所属するアカウントまたは管理者のみです';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_inspection_completion_office ON orders;
CREATE TRIGGER trg_enforce_inspection_completion_office
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION enforce_inspection_completion_office();
