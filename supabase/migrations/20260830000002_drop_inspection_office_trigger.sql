-- 検品完了の事務所制限を解除（誰でも検品完了にできる運用に戻す）
-- profiles.office_id は今後の対策（振込管理の権限制御等）のため残す

DROP TRIGGER IF EXISTS trg_enforce_inspection_completion_office ON orders;
DROP FUNCTION IF EXISTS enforce_inspection_completion_office();
