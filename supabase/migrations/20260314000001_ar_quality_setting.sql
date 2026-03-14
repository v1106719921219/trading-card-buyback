-- 美品査定受付のON/OFF設定をapp_settingsに追加
INSERT INTO app_settings (key, value, description)
VALUES ('ar_quality_enabled', 'false', '美品査定の受付を有効にする')
ON CONFLICT (key) DO NOTHING;
