-- 既存の広すぎるストレージRLSポリシーを削除
DROP POLICY IF EXISTS "kyc_documents_select_authenticated" ON storage.objects;

-- テナントスコープの読み取りポリシー
-- 管理者は自テナントのKYC画像のみ閲覧可能
CREATE POLICY "kyc_documents_select_tenant" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = (
      SELECT get_user_tenant_id(auth.uid())::text
    )
  );
