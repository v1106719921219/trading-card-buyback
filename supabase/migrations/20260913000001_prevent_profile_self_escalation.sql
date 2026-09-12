-- Staff accounts are provisioned by createStaff using service_role.
-- Self-service profile INSERT/UPDATE allowed changing role and tenant_id.
-- Keep the existing tenant-scoped admin UPDATE policy for staff management.
BEGIN;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
REVOKE INSERT ON TABLE public.profiles FROM anon, authenticated;
COMMIT;
