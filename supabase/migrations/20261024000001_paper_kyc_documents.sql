BEGIN;
-- 紙で受領した本人確認書類のスキャン/写真を注文に紐づけて保存する。
-- 承認（order_paper_kyc）とは独立に、受領時点でスタッフが登録できる。画像本体は kyc-documents バケットの
-- <tenant_id>/paper/<order_id>/ 配下に置き、ここにはパスだけを持つ。書き込みはサーバー（service_role）経由のみ。
CREATE TABLE public.order_paper_kyc_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
 label text NOT NULL CHECK (label IN ('front','back','other')),
 storage_path text NOT NULL UNIQUE CHECK (length(storage_path) BETWEEN 1 AND 500),
 uploaded_by uuid NOT NULL,
 uploaded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX order_paper_kyc_documents_order ON public.order_paper_kyc_documents(tenant_id, order_id);
ALTER TABLE public.order_paper_kyc_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_paper_kyc_documents FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.order_paper_kyc_documents TO authenticated;
GRANT ALL ON public.order_paper_kyc_documents TO service_role;
-- 閲覧条件は order_paper_kyc と同じ（スタッフ、または二段階認証済みの管理者・マネージャー）
CREATE POLICY paper_kyc_documents_read ON public.order_paper_kyc_documents FOR SELECT TO authenticated USING (
 tenant_id=public.get_user_tenant_id(auth.uid()) AND
 (public.get_user_role(auth.uid())='staff' OR (public.get_user_role(auth.uid()) IN ('admin','manager') AND auth.jwt()->>'aal'='aal2'))
);
NOTIFY pgrst,'reload schema';
COMMIT;
