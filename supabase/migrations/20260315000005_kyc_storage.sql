-- KYC書類用Storageバケットを作成
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kyc-documents',
  'kyc-documents',
  false,
  10485760,  -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
);

-- Storage RLSポリシー
-- service_role（adminClient）のみ全操作許可
-- 公開ユーザーはSupabase Authアカウントを持たないため、API Route経由でadminClientを使用

-- authenticated（管理者）: テナント内ファイルの読み取り
CREATE POLICY "kyc_documents_select_authenticated" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'kyc-documents'
  );

-- service_role: 全操作（INSERT/UPDATE/DELETE）はデフォルトでRLSバイパス
