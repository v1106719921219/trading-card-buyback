'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { pushTextMessage } from '@/lib/line'
import { paymentCompletedMessage } from '@/lib/line-messages'
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
    .update({ status: '振込済', paid_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('status', '検品完了')
    .select('*, order_items(*)')

  if (updateError) return { error: updateError.message }

  if (!updated || updated.length === 0) {
    return { error: '検品完了の注文のみ振込済に変更できます（既に変更済みの可能性があります）' }
  }

  const order = updated[0]

  // 振込完了をLINEで通知（メールは全廃）。査定結果PDFは査定状況からダウンロード
  const amount = (order.inspected_total_amount ?? order.total_amount) - (order.inspection_discount ?? 0)
  let notified = false
  if (order.line_user_id) {
    const result = await pushTextMessage(
      order.line_user_id,
      paymentCompletedMessage(order.order_number, amount)
    ).catch((err) => {
      console.error('[markAsPaid] LINE送信エラー:', err)
      return { success: false }
    })
    notified = result.success
  }

  revalidatePath('/admin/payments')
  revalidatePath('/admin/orders')
  revalidatePath('/admin')

  if (!notified) {
    return {
      success: true,
      warning: order.line_user_id
        ? 'ステータスは更新しましたが、LINE通知の送信に失敗しました'
        : 'ステータスは更新しました（LINE未連携のためお客様への通知は送信されていません）',
    }
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
