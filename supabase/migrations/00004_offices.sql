-- ============================================================================
-- Migration: 00004_offices
-- Description: 発送先事務所の選択機能
-- ============================================================================

-- offices テーブル作成
CREATE TABLE offices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  postal_code TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at トリガー
CREATE TRIGGER update_offices_updated_at
  BEFORE UPDATE ON offices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- シードデータ（ダミー住所）
INSERT INTO offices (name, postal_code, address, phone, sort_order) VALUES
  ('東京事務所', '100-0001', '東京都千代田区千代田1-1-1 サンプルビル3F', '03-0000-0000', 1),
  ('山口事務所', '750-0001', '山口県下関市大字関1-1-1 サンプルビル2F', '083-000-0000', 2);

-- orders テーブルに office_id カラム追加
ALTER TABLE orders ADD COLUMN office_id UUID REFERENCES offices(id);

-- インデックス
CREATE INDEX idx_offices_is_active ON offices(is_active);
CREATE INDEX idx_orders_office_id ON orders(office_id);

-- ============================================================================
-- RLS ポリシー
-- ============================================================================
ALTER TABLE offices ENABLE ROW LEVEL SECURITY;

-- 公開読み取り（申込フォームから参照するため、anon含む全ユーザーが読み取り可）
CREATE POLICY "offices_public_read" ON offices
  FOR SELECT
  USING (true);

-- admin/manager のみ更新可
CREATE POLICY "offices_admin_manager_update" ON offices
  FOR UPDATE
  USING (get_user_role(auth.uid()) IN ('admin', 'manager'));

-- admin のみ挿入・削除可
CREATE POLICY "offices_admin_insert" ON offices
  FOR INSERT
  WITH CHECK (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "offices_admin_delete" ON offices
  FOR DELETE
  USING (get_user_role(auth.uid()) = 'admin');
