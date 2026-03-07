'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizeError } from '@/lib/security'

// ============================================================================
// スーパー管理者チェック
// ============================================================================

export async function requireSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/superadmin/login')

  const { data } = await supabase
    .from('super_admins')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!data) redirect('/superadmin/login')
  return { user, superAdmin: data }
}

// ============================================================================
// テナント管理
// ============================================================================

export async function getTenants() {
  await requireSuperAdmin()
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw new Error(sanitizeError(error))
  return data
}

export async function getTenant(id: string) {
  await requireSuperAdmin()
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) return null
  return data
}

export async function createTenant(input: {
  slug: string
  name: string
  display_name: string
  ancient_dealer_number?: string
  plan: 'starter' | 'standard' | 'pro'
  primary_color?: string
}) {
  await requireSuperAdmin()
  const supabase = createAdminClient()

  // slugの形式チェック
  if (!/^[a-z0-9-]+$/.test(input.slug)) {
    return { error: 'slugは半角英数字とハイフンのみ使用可能です' }
  }

  const { data, error } = await supabase
    .from('tenants')
    .insert({
      slug: input.slug,
      name: input.name,
      display_name: input.display_name,
      ancient_dealer_number: input.ancient_dealer_number || null,
      plan: input.plan,
      primary_color: input.primary_color || '#2563eb',
    })
    .select('*')
    .single()

  if (error) {
    if (error.message.includes('duplicate') || error.message.includes('unique')) {
      return { error: 'このslugは既に使用されています' }
    }
    return { error: sanitizeError(error) }
  }

  return { data, error: null }
}

export async function updateTenant(id: string, input: {
  name?: string
  display_name?: string
  ancient_dealer_number?: string
  plan?: 'starter' | 'standard' | 'pro'
  primary_color?: string
  is_active?: boolean
}) {
  await requireSuperAdmin()
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('tenants')
    .update(input)
    .eq('id', id)

  if (error) return { error: sanitizeError(error) }
  return { error: null }
}

export async function toggleTenantActive(id: string, isActive: boolean) {
  return updateTenant(id, { is_active: isActive })
}

// ============================================================================
// テナントのスタッフ管理
// ============================================================================

export async function getTenantStaff(tenantId: string) {
  await requireSuperAdmin()
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(sanitizeError(error))
  return data
}

export async function createTenantAdmin(tenantId: string, input: {
  email: string
  password: string
  display_name: string
}) {
  await requireSuperAdmin()
  const supabase = createAdminClient()

  // Authユーザー作成
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  })

  if (authError) {
    if (authError.message.includes('already')) {
      return { error: 'このメールアドレスは既に登録されています' }
    }
    return { error: '管理者アカウントの作成に失敗しました' }
  }

  // profileを作成（admin権限、指定テナントに所属）
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: authData.user.id,
      email: input.email,
      display_name: input.display_name,
      role: 'admin',
      tenant_id: tenantId,
    })

  if (profileError) {
    await supabase.auth.admin.deleteUser(authData.user.id)
    return { error: 'プロフィールの作成に失敗しました' }
  }

  return { error: null }
}

// ============================================================================
// 統計情報
// ============================================================================

export async function getSuperAdminStats() {
  await requireSuperAdmin()
  const supabase = createAdminClient()

  const [tenantsResult, ordersResult] = await Promise.all([
    supabase.from('tenants').select('id, is_active, plan, created_at'),
    supabase.from('orders').select('tenant_id, created_at').gte(
      'created_at',
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    ),
  ])

  const tenants = tenantsResult.data || []
  const orders = ordersResult.data || []

  return {
    totalTenants: tenants.length,
    activeTenants: tenants.filter(t => t.is_active).length,
    ordersLast30Days: orders.length,
    planBreakdown: {
      starter: tenants.filter(t => t.plan === 'starter').length,
      standard: tenants.filter(t => t.plan === 'standard').length,
      pro: tenants.filter(t => t.plan === 'pro').length,
    },
  }
}
