'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, sanitizeError } from '@/lib/security'
import { requireTenantId } from '@/lib/tenant'
import type { UserRole } from '@/types/database'

export async function login(formData: FormData) {
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
}) {
  // admin のみ実行可能
  const { error: authError } = await requireRole(['admin'])
  if (authError) return { error: authError }

  // 現在のテナントIDを取得（スタッフは同テナントに所属させる）
  const tenantId = await requireTenantId()

  const supabase = createAdminClient()

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

  return profile
}
