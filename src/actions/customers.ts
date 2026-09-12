'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenantId } from '@/lib/tenant'

const CUSTOMER_COLUMNS = 'customer_name, customer_line_name, customer_email, customer_phone, customer_birth_date, customer_occupation, customer_prefecture, customer_address, customer_not_invoice_issuer, invoice_issuer_number, customer_identity_method, bank_name, bank_branch, bank_account_type, bank_account_number, bank_account_holder'

// メールアドレスでの過去情報引き込みは廃止（無認証で個人情報＋口座が引けるためセキュリティ上停止）。
// リピーターの自動入力はLINE本人確認済み（getLinePrefillByIdToken）経由のみ。
export async function lookupCustomerByEmail(_email: string): Promise<null> {
  return null
}

// LIFF（LINEアプリ内で開いた申込）用: IDトークンを検証して本人の過去情報を返す
// 条件: LINE連携済み（IDトークン検証OK）＋ eKYC承認済みの本人のみ自動入力
// メールと違い、なりすまし不可能な本人確認済みの情報なので安全に自動入力できる
export async function getLinePrefillByIdToken(idToken: string) {
  const { verifyLineIdToken } = await import('@/lib/line-verify')
  const verified = await verifyLineIdToken(idToken)
  if (!verified?.userId) return null

  const tenantId = await requireTenantId()
  const supabase = createAdminClient()

  // このLINEユーザーの直近の注文（＝本人の過去情報）
  const { data: customer } = await supabase
    .from('orders')
    .select(CUSTOMER_COLUMNS)
    .eq('line_user_id', verified.userId)
    .eq('tenant_id', tenantId)
    .not('customer_name', 'ilike', '【テスト】%')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!customer) return null

  // eKYC承認済みか確認（LINE本人＝line_user_idで照合。本人確認が取れている人のみ自動入力）
  const { data: kyc } = await supabase
    .from('kyc_requests')
    .select('id')
    .eq('line_user_id', verified.userId)
    .eq('tenant_id', tenantId)
    .eq('status', 'approved')
    .limit(1)
    .maybeSingle()

  if (!kyc) return null // 未eKYCなら自動入力しない

  return customer
}
