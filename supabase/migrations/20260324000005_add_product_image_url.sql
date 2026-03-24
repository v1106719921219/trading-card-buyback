-- productsテーブルに商品画像URLカラムを追加
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 商品画像用のpublicストレージバケットを作成
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 認証済みユーザー（管理者）のみアップロード可
CREATE POLICY "product_images_insert_authenticated" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images');

-- 公開読み取り（バケットがpublicなのでオブジェクトも公開）
CREATE POLICY "product_images_select_public" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'product-images');

-- 認証済みユーザーのみ削除可
CREATE POLICY "product_images_delete_authenticated" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'product-images');
