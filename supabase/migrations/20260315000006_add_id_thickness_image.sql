-- 身分証の厚み撮影画像パスを追加（古物営業法対応）
ALTER TABLE kyc_requests ADD COLUMN id_thickness_image_path TEXT;
