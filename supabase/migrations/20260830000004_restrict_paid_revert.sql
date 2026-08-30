-- 振込済→検品完了への「戻す」操作をadminのみに制限（二重振込防止）
-- 戻すと振込管理の振込待ちに再度載るため、スタッフが二重振込を誘発できる経路を塞ぐ

CREATE OR REPLACE FUNCTION enforce_paid_revert_admin()
RETURNS TRIGGER AS $$
DECLARE
  v_uid UUID;
  v_role TEXT;
BEGIN
  IF OLD.status = '振込済' AND NEW.status = '検品完了' THEN
    v_uid := auth.uid();
    -- service role等のシステム処理(auth.uidなし)は許可
    IF v_uid IS NOT NULL THEN
      SELECT role INTO v_role FROM profiles WHERE id = v_uid;
      IF v_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION '振込済から検品完了に戻せるのは管理者のみです';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_paid_revert_admin ON orders;
CREATE TRIGGER trg_enforce_paid_revert_admin
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION enforce_paid_revert_admin();
