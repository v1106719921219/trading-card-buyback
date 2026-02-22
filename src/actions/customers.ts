'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Customer } from '@/types/database'

export async function sendMagicLink(email: string) {
  const supabase = createAdminClient()

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback?redirect=/apply`,
    },
  })

  if (error) {
    return { error: `メールの送信に失敗しました: ${error.message}` }
  }

  return { success: true }
}

export async function getCustomerProfile(): Promise<Customer | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data } = await supabase
    .from('customers')
    .select('*')
    .eq('id', user.id)
    .single()

  return data
}

export async function upsertCustomerProfile(profile: {
  name: string
  email: string
  phone?: string
  address?: string
  line_name?: string
  birth_date?: string
  occupation?: string
  not_invoice_issuer?: boolean
  identity_method?: string
  bank_name?: string
  bank_branch?: string
  bank_account_type?: '普通' | '当座'
  bank_account_number?: string
  bank_account_holder?: string
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: '認証されていません' }
  }

  const { error } = await supabase.from('customers').upsert({
    id: user.id,
    email: profile.email,
    name: profile.name,
    phone: profile.phone || '',
    address: profile.address || '',
    line_name: profile.line_name || '',
    birth_date: profile.birth_date || null,
    occupation: profile.occupation || '',
    not_invoice_issuer: profile.not_invoice_issuer || false,
    identity_method: profile.identity_method || '',
    bank_name: profile.bank_name || '',
    bank_branch: profile.bank_branch || '',
    bank_account_type: profile.bank_account_type || '普通',
    bank_account_number: profile.bank_account_number || '',
    bank_account_holder: profile.bank_account_holder || '',
  })

  if (error) {
    return { error: `プロフィールの保存に失敗しました: ${error.message}` }
  }

  return { success: true, customer_id: user.id }
}

export async function customerLogout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return { success: true }
}
