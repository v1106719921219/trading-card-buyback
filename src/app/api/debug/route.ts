import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

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

  // 3. Try DB connection
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Check if tenants table exists
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, slug, is_active, display_name, site_name')
      .limit(10)

    if (tenantsError) {
      checks.tenantsTable = { error: tenantsError.message, code: tenantsError.code }
    } else {
      checks.tenantsTable = { rows: tenants }
    }

    // Check if categories table exists
    const { data: categories, error: catError } = await supabase
      .from('categories')
      .select('id, name')
      .limit(5)

    if (catError) {
      checks.categoriesTable = { error: catError.message, code: catError.code }
    } else {
      checks.categoriesTable = { count: categories?.length }
    }
  } catch (e) {
    checks.dbConnection = { error: String(e) }
  }

  return NextResponse.json(checks, { status: 200 })
}
