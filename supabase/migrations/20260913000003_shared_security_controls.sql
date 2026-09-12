BEGIN;
-- Apply MFA at the data boundary as well as the UI/Server Actions.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['orders','order_items','kyc_requests','kyc_audit_logs','app_settings','products','categories','subcategories','offices'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS privileged_mfa_required ON public.%I',t);
  EXECUTE format('CREATE POLICY privileged_mfa_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.get_user_role(auth.uid()) NOT IN (''admin'',''manager'') OR auth.jwt()->>''aal''=''aal2'') WITH CHECK (public.get_user_role(auth.uid()) NOT IN (''admin'',''manager'') OR auth.jwt()->>''aal''=''aal2'')',t);
 END LOOP;
END $$;
DROP POLICY IF EXISTS profile_admin_mfa_required ON public.profiles;
CREATE POLICY profile_admin_mfa_required ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated
 USING (auth.jwt()->>'aal'='aal2') WITH CHECK (auth.jwt()->>'aal'='aal2');

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['kyc_requests','kyc_audit_logs'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS kyc_tenant_boundary ON public.%I',t);
  EXECUTE format('CREATE POLICY kyc_tenant_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (tenant_id=public.get_user_tenant_id(auth.uid())) WITH CHECK (tenant_id=public.get_user_tenant_id(auth.uid()))',t);
 END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.security_rate_limits (key text PRIMARY KEY, window_end timestamptz NOT NULL, count integer NOT NULL);
ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_rate_limits FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.security_rate_limits TO service_role;
CREATE OR REPLACE FUNCTION public.consume_security_limit(p_key text,p_limit integer,p_seconds integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE n integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_limit<1 OR p_seconds<1 OR length(p_key)>200 THEN RAISE EXCEPTION 'Invalid rate limit call'; END IF;
 INSERT INTO public.security_rate_limits(key,window_end,count) VALUES(p_key,now()+make_interval(secs=>p_seconds),1)
 ON CONFLICT(key) DO UPDATE SET count=CASE WHEN security_rate_limits.window_end<=now() THEN 1 ELSE security_rate_limits.count+1 END,
 window_end=CASE WHEN security_rate_limits.window_end<=now() THEN now()+make_interval(secs=>p_seconds) ELSE security_rate_limits.window_end END RETURNING count INTO n;
 -- Bounded opportunistic cleanup avoids retaining IP-derived hashes indefinitely.
 DELETE FROM public.security_rate_limits WHERE key IN (SELECT key FROM public.security_rate_limits WHERE window_end<now()-interval '1 day' LIMIT 100);
 RETURN n<=p_limit;
END $$;
REVOKE ALL ON FUNCTION public.consume_security_limit(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_security_limit(text,integer,integer) TO service_role;
CREATE TABLE IF NOT EXISTS public.line_webhook_events(tenant_id uuid NOT NULL,event_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,event_id));
ALTER TABLE public.line_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.line_webhook_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.line_webhook_events TO service_role;

-- Existing singleton connection is retained, but explicitly bound to the operating tenant.
DO $$ BEGIN
 IF to_regclass('public.mf_tokens') IS NOT NULL THEN
  ALTER TABLE public.mf_tokens ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
  ALTER TABLE public.mf_tokens ADD COLUMN IF NOT EXISTS access_token_encrypted text;
  ALTER TABLE public.mf_tokens ADD COLUMN IF NOT EXISTS refresh_token_encrypted text;
  REVOKE ALL ON public.mf_tokens FROM anon,authenticated;
 END IF;
END $$;
-- Storage requests bypass application routes, so enforce MFA there too.
DO $$ BEGIN
 IF to_regclass('storage.objects') IS NOT NULL THEN
  DROP POLICY IF EXISTS kyc_storage_mfa ON storage.objects;
  CREATE POLICY kyc_storage_mfa ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
   USING (bucket_id <> 'kyc-documents' OR (public.get_user_role(auth.uid()) IN ('admin','manager','staff') AND (public.get_user_role(auth.uid())='staff' OR auth.jwt()->>'aal'='aal2')));
  DROP POLICY IF EXISTS product_images_insert_authenticated ON storage.objects;
  DROP POLICY IF EXISTS product_images_delete_authenticated ON storage.objects;
  CREATE POLICY product_images_insert_authenticated ON storage.objects FOR INSERT TO authenticated
   WITH CHECK (bucket_id='product-images' AND split_part(name,'/',1)=public.get_user_tenant_id(auth.uid())::text AND public.get_user_role(auth.uid()) IN ('admin','manager') AND auth.jwt()->>'aal'='aal2');
  CREATE POLICY product_images_delete_authenticated ON storage.objects FOR DELETE TO authenticated
   USING (bucket_id='product-images' AND split_part(name,'/',1)=public.get_user_tenant_id(auth.uid())::text AND public.get_user_role(auth.uid()) IN ('admin','manager') AND auth.jwt()->>'aal'='aal2');
 END IF;
END $$;
COMMIT;
