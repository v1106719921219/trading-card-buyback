import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getTenant } from '@/lib/tenant'
import { toTenantInfo } from '@/lib/tenant-info'

export async function GET() {
  const checks: Record<string, unknown> = {}

  // 1. Check env vars
  checks.envVars = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    DEFAULT_TENANT_SLUG: process.env.DEFAULT_TENANT_SLUG || '(not set)',
    NEXT_PUBLIC_ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN || '(not set)',
  }

  // 2. Check tenant slug from middleware
  const headersList = await headers()
  checks.tenantSlug = headersList.get('x-tenant-slug') || '(not set)'

  // 3. Test getTenant() - same function used by layout.tsx
  try {
    const tenant = await getTenant()
    if (tenant) {
      checks.getTenant = { success: true, tenant: { id: tenant.id, slug: tenant.slug, display_name: tenant.display_name, site_name: tenant.site_name } }
      try {
        const tenantInfo = toTenantInfo(tenant)
        checks.toTenantInfo = { success: true, tenantInfo }
      } catch (e) {
        checks.toTenantInfo = { error: String(e) }
      }
    } else {
      checks.getTenant = { success: true, result: null }
    }
  } catch (e) {
    checks.getTenant = { error: String(e), stack: (e as Error).stack }
  }

  // 4. Try DB connection directly
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, slug, is_active, display_name, site_name')
      .limit(10)

    if (tenantsError) {
      checks.tenantsTable = { error: tenantsError.message, code: tenantsError.code }
    } else {
      checks.tenantsTable = { rows: tenants }
    }
  } catch (e) {
    checks.dbConnection = { error: String(e) }
  }

  return NextResponse.json(checks, { status: 200 })
}
