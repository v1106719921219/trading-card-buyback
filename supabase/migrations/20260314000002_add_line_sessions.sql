-- LINE会話セッション管理テーブル
CREATE TABLE line_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  line_user_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'idle',
  parsed_items jsonb,
  raw_text text,
  office_id uuid REFERENCES offices(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(line_user_id, tenant_id)
);

CREATE INDEX idx_line_sessions_line_user_id ON line_sessions(line_user_id);

ALTER TABLE line_sessions ENABLE ROW LEVEL SECURITY;

-- service_role のみアクセス可（WebhookはadminClientで操作するため）
-- RLSポリシーなし = anon/authenticatedはアクセス不可、service_roleのみバイパス
