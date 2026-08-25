'use server'

import { createAdminClient } from '@/lib/supabase/admin'

const CUSTOMER_COLUMNS = 'customer_name, customer_line_name, customer_email, customer_phone, customer_birth_date, customer_occupation, customer_prefecture, customer_address, customer_not_invoice_issuer, invoice_issuer_number, customer_identity_method, bank_name, bank_branch, bank_account_type, bank_account_number, bank_account_holder'

export async function lookupCustomerByEmail(email: string) {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('orders')
    .select(CUSTOMER_COLUMNS)
    .eq('customer_email', email)
    // テストデータ（【テスト】プレフィックス付き）は引き込み対象から除外
    .not('customer_name', 'ilike', '【テスト】%')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    return null
  }

  return data
}

// LINE userIdから直近の注文の顧客情報を取得（LINE経由申込の自動プレフィル用）
export async function lookupCustomerByLineUserId(lineUserId: string) {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('orders')
    .select(CUSTOMER_COLUMNS)
    .eq('line_user_id', lineUserId)
    // テストデータ（【テスト】プレフィックス付き）は引き込み対象から除外
    .not('customer_name', 'ilike', '【テスト】%')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return data
}
