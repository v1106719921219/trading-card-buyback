'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { sendPaymentCompletionEmail } from '@/lib/email'

export async function getPaymentQueue() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('status', '検品完了')
    .order('updated_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data
}

export async function markAsPaid(orderId: string) {
  const supabase = await createClient()

  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('status, customer_email, order_number, inspected_total_amount, total_amount')
    .eq('id', orderId)
    .single()

  if (fetchError || !order) {
    return { error: '注文が見つかりません' }
  }

  if (order.status !== '検品完了') {
    return { error: '検品完了の注文のみ振込済に変更できます' }
  }

  const { error } = await supabase
    .from('orders')
    .update({ status: '振込済' })
    .eq('id', orderId)

  if (error) return { error: error.message }

  // 振込完了メールを送信
  const amount = order.inspected_total_amount ?? order.total_amount
  await sendPaymentCompletionEmail(order.customer_email, order.order_number, amount)

  revalidatePath('/admin/payments')
  revalidatePath('/admin/orders')
  revalidatePath('/admin')
  return { success: true }
}

export async function bulkMarkAsPaid(orderIds: string[]) {
  const supabase = await createClient()
  const errors: string[] = []

  for (const id of orderIds) {
    const result = await markAsPaid(id)
    if (result.error) errors.push(`${id}: ${result.error}`)
  }

  if (errors.length > 0) {
    return { error: `一部の振込処理に失敗しました` }
  }

  revalidatePath('/admin/payments')
  revalidatePath('/admin/orders')
  revalidatePath('/admin')
  return { success: true }
}
