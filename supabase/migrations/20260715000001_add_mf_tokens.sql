-- マネーフォワード連携用のOAuthトークン保存テーブル
-- service_role（サーバーサイド）のみアクセス。RLS有効・ポリシーなしでanon/authenticatedを遮断
CREATE TABLE IF NOT EXISTS mf_tokens (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- 単一行のみ
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mf_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE mf_tokens IS 'マネーフォワードクラウド会計 OAuthトークン（振込照合用）';
