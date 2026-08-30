'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/actions/auth'
import { submitInspectionSchema, type SubmitInspectionInput } from '@/lib/validators/inspection'

// 検品者として選択できるスタッフ名一覧（共有アカウント・テスト用は除外）
// 並び順: 注文の担当事務所所属のスタッフ → 所属なしのスタッフ（全事務所共通メンバー）
// 他事務所所属のスタッフは表示しない
export async function getInspectorOptions(
  officeId?: string | null
): Promise<{ id: string; display_name: string }[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, office_id')
    .eq('tenant_id', user.tenant_id)
    .order('display_name')

  const individuals = (data ?? []).filter((p) => !/事務所|テスト/.test(p.display_name))
  const officeMembers = officeId ? individuals.filter((p) => p.office_id === officeId) : []
  const commonMembers = individuals.filter((p) => !p.office_id)
  return [...officeMembers, ...commonMembers].map(({ id, display_name }) => ({ id, display_name }))
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
