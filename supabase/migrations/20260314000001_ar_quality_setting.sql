-- app_settingsのPKをkey単独から(key, tenant_id)に変更
-- tenant_idにデフォルト値を設定してNULLのレコードを更新
-- 既存のNULLのtenant_idレコードがある場合は、最初のアクティブテナントに紐付ける
UPDATE app_settings
SET tenant_id = (SELECT id FROM tenants WHERE is_active = true LIMIT 1)
WHERE tenant_id IS NULL;

ALTER TABLE app_settings ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE app_settings DROP CONSTRAINT app_settings_pkey;
ALTER TABLE app_settings ADD PRIMARY KEY (key, tenant_id);

-- 美品査定受付のON/OFF設定をapp_settingsに追加
INSERT INTO app_settings (key, value, description, tenant_id)
SELECT 'ar_quality_enabled', 'false', '美品査定の受付を有効にする', id
FROM tenants WHERE is_active = true
ON CONFLICT (key, tenant_id) DO NOTHING;
