'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPaymentCompletionEmail } from '@/lib/email'
import { generateInspectionPdf } from '@/lib/pdf'

export async function getPaymentQueue() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('status', '検品完了')
    .order('updated_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data
}

export async function markAsPaid(orderId: string) {
  const supabase = createAdminClient()

  // Atomic update: WHERE status = '検品完了' で TOCTOU 防止
  const { data: updated, error: updateError } = await supabase
    .from('orders')
    .update({ status: '振込済' })
    .eq('id', orderId)
    .eq('status', '検品完了')
    .select('*, order_items(*)')

  if (updateError) return { error: updateError.message }

  if (!updated || updated.length === 0) {
    return { error: '検品完了の注文のみ振込済に変更できます（既に変更済みの可能性があります）' }
  }

  const order = updated[0]

  // PDF生成 → 振込完了メール送信
  const amount = (order.inspected_total_amount ?? order.total_amount) - (order.inspection_discount ?? 0)
  let emailSent = false
  try {
    const pdfBuffer = await generateInspectionPdf(order, order.order_items ?? [])
    await sendPaymentCompletionEmail(order.customer_email, order.order_number, amount, pdfBuffer)
    emailSent = true
  } catch (err) {
    console.error('[markAsPaid] PDF/Email error:', err)
    // PDF失敗時もメール送信を試みる（PDF添付なし）
    try {
      await sendPaymentCompletionEmail(order.customer_email, order.order_number, amount)
      emailSent = true
    } catch (emailErr) {
      console.error('[markAsPaid] Fallback email also failed:', emailErr)
    }
  }

  revalidatePath('/admin/payments')
  revalidatePath('/admin/orders')
  revalidatePath('/admin')

  if (!emailSent) {
    return { success: true, warning: 'ステータスは更新しましたが、メール送信に失敗しました' }
  }
  return { success: true }
}

export async function downloadInspectionPdf(orderId: string) {
  const supabase = createAdminClient()

  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', orderId)
    .single()

  if (fetchError || !order) {
    return { error: '注文が見つかりません' }
  }

  const pdfBuffer = await generateInspectionPdf(order, order.order_items ?? [])
  // base64に変換してクライアントに返す
  return {
    data: pdfBuffer.toString('base64'),
    filename: `査定結果_${order.order_number}.pdf`,
  }
}

export async function bulkMarkAsPaid(orderIds: string[]) {
  const errors: string[] = []
  const warnings: string[] = []

  for (const id of orderIds) {
    const result = await markAsPaid(id)
    if (result.error) errors.push(`${id}: ${result.error}`)
    if ('warning' in result && result.warning) warnings.push(result.warning)
  }

  if (errors.length > 0) {
    return { error: `一部の振込処理に失敗しました` }
  }

  revalidatePath('/admin/payments')
  revalidatePath('/admin/orders')
  revalidatePath('/admin')

  if (warnings.length > 0) {
    return { success: true, warning: `${warnings.length}件でメール送信に失敗しました` }
  }
  return { success: true }
}
