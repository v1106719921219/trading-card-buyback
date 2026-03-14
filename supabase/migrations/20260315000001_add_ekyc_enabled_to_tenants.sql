-- eKYC機能の有効/無効をテナント単位で制御するカラムを追加
ALTER TABLE tenants ADD COLUMN ekyc_enabled BOOLEAN NOT NULL DEFAULT false;
