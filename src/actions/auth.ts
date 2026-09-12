'use server'

import { limitPublicRequest } from '@/lib/shared-rate-limit'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, sanitizeError } from '@/lib/security'
import { requireTenantId } from '@/lib/tenant'
import type { UserRole } from '@/types/database'

export async function login(formData: FormData) {
  if (!await limitPublicRequest('login', 15, 900)) return { error: 'ログイン試行が多すぎます。15分後にお試しください' }
  const supabase = await createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'メールアドレスとパスワードを入力してください' }
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: 'メールアドレスまたはパスワードが正しくありません' }
  }

  redirect('/admin')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function createStaff(data: {
  email: string
  password: string
  display_name: string
  role: UserRole
  office_id?: string | null
}) {
  // admin のみ実行可能
  const { error: authError } = await requireRole(['admin'])
  if (authError) return { error: authError }

  // 現在のテナントIDを取得（スタッフは同テナントに所属させる）
  const tenantId = await requireTenantId()

  const supabase = createAdminClient()

  if (!['admin', 'manager', 'staff'].includes(data.role) || typeof data.password !== 'string' || data.password.length < 12 || data.password.length > 256) return { error: '権限と12文字以上のパスワードを指定してください' }
  if (data.office_id) {
    const { data: office } = await supabase.from('offices').select('id').eq('id', data.office_id).eq('tenant_id', tenantId).maybeSingle()
    if (!office) return { error: '所属事務所を確認してください' }
  }

  // Create auth user
  const { data: authData, error: createError } = await supabase.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
  })

  if (createError) {
    if (createError.message.includes('already been registered')) {
      return { error: 'このメールアドレスは既に登録されています' }
    }
    return { error: 'ユーザー作成に失敗しました' }
  }

  // Create profile（tenant_idを必ず付与）
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: authData.user.id,
      email: data.email,
      display_name: data.display_name,
      role: data.role,
      office_id: data.office_id ?? null,
      tenant_id: tenantId,
    })

  if (profileError) {
    // Rollback: delete auth user
    await supabase.auth.admin.deleteUser(authData.user.id)
    console.error('[createStaff] profile insert failed:', profileError)
    return { error: 'スタッフ登録に失敗しました' }
  }

  return { error: null }
}

export async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return profile?.is_active === false ? null : profile
}

/** Revoke data access immediately, including already-issued sessions; preserve audit identity. */
export async function setStaffActive(profileId: string, active: boolean) {
  const { user, error } = await requireRole(['admin'])
  if (error || !user) return { error: error ?? '権限がありません' }
  if (typeof active !== 'boolean' || profileId === user.id) return { error: '自分のアカウントは停止できません' }
  const db = createAdminClient()
  const { data: target } = await db.from('profiles').select('id').eq('id', profileId).eq('tenant_id', user.tenant_id).maybeSingle()
  if (!target) return { error: '対象のアカウントが見つかりません' }
  const { error: updateError } = await db.from('profiles').update({ is_active: active }).eq('id', profileId).eq('tenant_id', user.tenant_id)
  if (updateError) return { error: 'アカウントの状態を変更できませんでした' }
  const { error: auditError } = await db.from('security_audit_events').insert({ tenant_id: user.tenant_id, actor_id: user.id, action: active ? 'staff_enabled' : 'staff_disabled', record_id: profileId })
  if (auditError) console.error('[SECURITY] Staff access audit could not be saved')
  return { success: true }
}
