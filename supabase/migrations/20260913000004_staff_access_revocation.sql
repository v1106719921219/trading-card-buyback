BEGIN;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT role FROM public.profiles WHERE id=user_id AND is_active=true;
$$;
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(user_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT tenant_id FROM public.profiles WHERE id=user_id AND is_active=true;
$$;
COMMIT;
