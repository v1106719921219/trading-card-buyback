-- 検品者の記録: 検品完了にする際に「誰が検品したか」の選択を必須にする
-- 共有アカウント運用のまま個人を特定できるようにする（端末の個別化は不要）

ALTER TABLE orders ADD COLUMN IF NOT EXISTS inspected_by UUID REFERENCES profiles(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS inspected_by_name TEXT;

CREATE OR REPLACE FUNCTION enforce_inspector_on_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = '検品完了' AND OLD.status IS DISTINCT FROM NEW.status THEN
    -- service role等のシステム処理(auth.uidなし)は許可
    IF auth.uid() IS NOT NULL
       AND (NEW.inspected_by_name IS NULL OR NEW.inspected_by_name = '') THEN
      RAISE EXCEPTION '検品完了にするには検品入力画面で検品者を選択してください';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_inspector_on_completion ON orders;
CREATE TRIGGER trg_enforce_inspector_on_completion
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION enforce_inspector_on_completion();
