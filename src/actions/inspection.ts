'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/actions/auth'
import { requireRole } from '@/lib/security'
import { submitInspectionSchema, type SubmitInspectionInput } from '@/lib/validators/inspection'

// 検品者の名前リスト（表示用のみ・アカウント不要）
// app_settingsにカンマ区切りテキストで保存し、設定画面から管理する
//   inspector_names_common           … 全事務所共通の名前
//   inspector_names_office_<officeId> … その事務所専用の名前
const INSPECTOR_COMMON_KEY = 'inspector_names_common'
const inspectorOfficeKey = (officeId: string) => `inspector_names_office_${officeId}`

function parseNames(raw: string | undefined | null): string[] {
  return (raw ?? '')
    .split(/[,、\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// 検品入力の選択肢: その事務所専用の名前 → 共通の名前 の順（重複は除去）
export async function getInspectorOptions(officeId?: string | null): Promise<string[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const supabase = createAdminClient()
  const keys = [INSPECTOR_COMMON_KEY, ...(officeId ? [inspectorOfficeKey(officeId)] : [])]
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .eq('tenant_id', user.tenant_id)
    .in('key', keys)

  const map = Object.fromEntries((data ?? []).map((s) => [s.key, s.value]))
  const names = [
    ...(officeId ? parseNames(map[inspectorOfficeKey(officeId)]) : []),
    ...parseNames(map[INSPECTOR_COMMON_KEY]),
  ]
  return [...new Set(names)]
}

// 設定画面用: 検品者リストの取得（生テキスト）
export async function getInspectorNameSettings(): Promise<{
  common: string
  byOffice: Record<string, string>
}> {
  const user = await getCurrentUser()
  if (!user) return { common: '', byOffice: {} }

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .eq('tenant_id', user.tenant_id)
    .like('key', 'inspector_names%')

  const byOffice: Record<string, string> = {}
  let common = ''
  for (const s of data ?? []) {
    if (s.key === INSPECTOR_COMMON_KEY) common = s.value
    else if (s.key.startsWith('inspector_names_office_')) {
      byOffice[s.key.replace('inspector_names_office_', '')] = s.value
    }
  }
  return { common, byOffice }
}

// 設定画面用: 検品者リストの保存（adminのみ）
export async function saveInspectorNameSettings(input: {
  common: string
  byOffice: Record<string, string>
}): Promise<{ error?: string; success?: boolean }> {
  const { error: authError } = await requireRole(['admin'])
  if (authError) return { error: authError }
  const user = await getCurrentUser()
  if (!user) return { error: 'ログインしてください' }

  const supabase = createAdminClient()
  const rows = [
    { key: INSPECTOR_COMMON_KEY, value: input.common.trim(), description: '検品者リスト（全事務所共通・カンマ区切り）' },
    ...Object.entries(input.byOffice).map(([officeId, value]) => ({
      key: inspectorOfficeKey(officeId),
      value: value.trim(),
      description: '検品者リスト（事務所専用・カンマ区切り）',
    })),
  ]
  // app_settingsのkeyにユニーク制約がない環境があるためupsertは使わず、存在チェックして更新/挿入
  for (const row of rows) {
    const { data: existing } = await supabase
      .from('app_settings')
      .select('key')
      .eq('tenant_id', user.tenant_id)
      .eq('key', row.key)
      .limit(1)
    const { error } = existing && existing.length > 0
      ? await supabase
          .from('app_settings')
          .update({ value: row.value })
          .eq('tenant_id', user.tenant_id)
          .eq('key', row.key)
      : await supabase.from('app_settings').insert({ ...row, tenant_id: user.tenant_id })
    if (error) return { error: error.message }
  }
  return { success: true }
}

export async function submitInspection(input: SubmitInspectionInput) {
  const parsed = submitInspectionSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { order_id, items } = parsed.data

  // Verify order is in 発送済 status
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('status')
    .eq('id', order_id)
    .single()

  if (orderError || !order) {
    return { error: '注文が見つかりません' }
  }

  if (order.status !== '発送済') {
    return { error: '発送済の注文のみ検品結果を入力できます' }
  }

  // Update each order item's inspected_quantity
  for (const item of items) {
    const { error } = await supabase
      .from('order_items')
      .update({ inspected_quantity: item.inspected_quantity })
      .eq('id', item.id)
      .eq('order_id', order_id)

    if (error) {
      return { error: `検品数量の更新に失敗しました: ${error.message}` }
    }
  }

  // Calculate inspected total
  const { data: orderItems, error: itemsError } = await supabase
    .from('order_items')
    .select('unit_price, quantity, inspected_quantity')
    .eq('order_id', order_id)

  if (itemsError) {
    return { error: '検品合計の計算に失敗しました' }
  }

  const inspected_total_amount = orderItems.reduce((sum, item) => {
    const qty = item.inspected_quantity ?? item.quantity
    return sum + item.unit_price * qty
  }, 0)

  // Update order with inspected total
  const { error: updateError } = await supabase
    .from('orders')
    .update({ inspected_total_amount })
    .eq('id', order_id)

  if (updateError) {
    return { error: '検品合計の更新に失敗しました' }
  }

  revalidatePath(`/admin/orders/${order_id}`)
  revalidatePath(`/admin/orders/${order_id}/inspect`)
  return { success: true }
}
