-- 千葉DBに不足していたカラムを追加（東京DBには既に存在）
-- 未適用だと本人確認の削除がエラーになり、厚み画像のパスも保存されない
ALTER TABLE kyc_requests ADD COLUMN IF NOT EXISTS id_thickness_image_path TEXT;
