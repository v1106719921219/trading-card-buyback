'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/security'
import { generateInspectionPdf } from '@/lib/pdf'
import { jstToday, validPaymentDate } from '@/lib/payment-display'

export async function getPaymentQueue() {
  const { user, error: authError } = await requireRole(['admin', 'manager'])
  if (authError || !user) return { error: authError ?? '認証が必要です' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('status', '検品完了')
    .order('updated_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data
}

// 一括振込も画面で確認した残額・更新日時を使う。再取得した別の金額で勝手に確定しない。
export async function markAsPaid(orderId: string, amount: number, expectedUpdatedAt: string, requestId: string) {
  return recordPayment(orderId, 'bank_transfer', amount, jstToday(), expectedUpdatedAt, requestId, true)
}

export async function downloadInspectionPdf(orderId: string) {
  // スタッフもお客様への査定結果送付に使うため許可（振込系の操作はadmin/manager限定のまま）
  const { user, error: authError } = await requireRole(['admin', 'manager', 'staff'])
  if (authError || !user) return { error: authError ?? '認証が必要です' }
  const supabase = await createClient()

  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', orderId)
    .eq('tenant_id', user.tenant_id)
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

export async function bulkMarkAsPaid(payments: { id: string; amount: number; updatedAt: string; requestId: string }[]) {
  const { error: authError } = await requireRole(['admin', 'manager'])
  if (authError) return { error: authError }
  if (!Array.isArray(payments) || payments.length < 1 || payments.length > 100) return { error: '1〜100件を選択してください' }
  const errors: string[] = []
  for (const p of payments) {
    const result = await markAsPaid(p.id, p.amount, p.updatedAt, p.requestId)
    if (result.error) errors.push(result.error)
  }
  if (errors.length) return { error: `一部の支払登録に失敗しました: ${errors.join(' / ')}` }
  return { success: true }
}

export async function getOrderPayments(orderId: string) {
  const { user, error } = await requireRole(['admin', 'manager', 'staff'])
  if (error || !user) return { error: error ?? '認証が必要です' }
  const db = await createClient()
  const result = await db.from('order_payments').select('id,method,amount,paid_on,created_at,voided_at,void_reason,signature_path')
    .eq('tenant_id', user.tenant_id).eq('order_id', orderId).order('created_at', { ascending: true })
  if (result.error) return { error: '支払履歴を取得できませんでした' }
  return { data: result.data }
}

// 現金手渡しは受領サイン必須。署名画像を保存してから支払RPCを呼び、支払記録に紐付ける。
export async function recordCashPaymentWithSignature(orderId: string, amount: number, paymentDate: string, expectedUpdatedAt: string, requestId: string, signatureDataUrl: string): Promise<{ error?: string; success?: boolean }> {
  const { user, error: authError } = await requireRole(['admin', 'manager'])
  if (authError || !user) return { error: authError ?? '認証が必要です' }
  const prefix = 'data:image/png;base64,'
  if (typeof signatureDataUrl !== 'string' || !signatureDataUrl.startsWith(prefix)) return { error: '受領サインが必要です' }
  const base64 = signatureDataUrl.slice(prefix.length)
  if (base64.length < 500 || base64.length > 700_000 || !/^[A-Za-z0-9+/=]+$/.test(base64)) return { error: '署名画像を読み取れませんでした。書き直してください' }
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return { error: '不正なリクエストです' }
  const bytes = Buffer.from(base64, 'base64')
  const admin = createAdminClient()
  const path = `${user.tenant_id}/${orderId}/${requestId}.png`
  const upload = await admin.storage.from('cash-receipts').upload(path, bytes, { contentType: 'image/png', upsert: true })
  if (upload.error) return { error: '署名の保存に失敗しました。通信環境を確認して再度お試しください' }
  const result = await recordPayment(orderId, 'cash', amount, paymentDate, expectedUpdatedAt, requestId)
  if (result.error) {
    await admin.storage.from('cash-receipts').remove([path]).catch(() => {})
    return result
  }
  const link = await admin.from('order_payments').update({ signature_path: path }).eq('id', requestId).eq('tenant_id', user.tenant_id)
  if (link.error) return { error: '支払いは記録しましたが、署名の紐付けに失敗しました。この画面を再読み込みして管理者に連絡してください' }
  return { success: true }
}

// 受領サイン画像の閲覧用署名URL（10分有効）
export async function getPaymentSignatureUrl(orderId: string, paymentId: string) {
  const { user, error } = await requireRole(['admin', 'manager', 'staff'])
  if (error || !user) return { error: error ?? '認証が必要です' }
  const db = await createClient()
  const payment = await db.from('order_payments').select('signature_path')
    .eq('tenant_id', user.tenant_id).eq('order_id', orderId).eq('id', paymentId).single()
  if (payment.error || !payment.data?.signature_path) return { error: '署名が見つかりません' }
  const admin = createAdminClient()
  const signed = await admin.storage.from('cash-receipts').createSignedUrl(payment.data.signature_path, 600)
  if (signed.error || !signed.data?.signedUrl) return { error: '署名URLを発行できませんでした' }
  return { url: signed.data.signedUrl }
}

export async function recordPayment(orderId: string, method: 'cash' | 'bank_transfer', amount: number, paymentDate: string, expectedUpdatedAt: string, requestId: string, requireInspection = false) {
  const { user, error: authError } = await requireRole(['admin', 'manager'])
  if (authError || !user) return { error: authError ?? '認証が必要です' }
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2147483647 || !['cash', 'bank_transfer'].includes(method) || !validPaymentDate(paymentDate) || !/^[0-9a-f-]{36}$/i.test(requestId)) return { error: '金額・支払方法・日付を確認してください' }
  const db = await createClient()
  if (requireInspection) {
    const { data: order } = await db.from('orders').select('status').eq('tenant_id', user.tenant_id).eq('id', orderId).single()
    if (!order || order.status !== '検品完了') return { error: '検品完了の注文のみ振込登録できます。再読み込みしてください' }
  }
  const result = await db.rpc('record_order_payment', {
    p_tenant: user.tenant_id, p_order: orderId, p_method: method, p_amount: amount,
    p_paid_on: paymentDate, p_request: requestId, p_expected_updated_at: expectedUpdatedAt, p_require_full: requireInspection,
  })
  if (result.error) return { error: result.error.code === 'P0001' ? result.error.message : '支払いを登録できませんでした。再読み込みして履歴を確認してください' }
  for (const path of ['/admin', '/admin/orders', `/admin/orders/${orderId}`, '/admin/payments', '/admin/payment-verification']) revalidatePath(path)
  return { success: true }
}

export async function voidPayment(orderId: string, paymentId: string, reason: string, expectedUpdatedAt: string) {
  const { user, error } = await requireRole(['admin'])
  if (error || !user) return { error: error ?? '認証が必要です' }
  const db = await createClient()
  const result = await db.rpc('void_order_payment', { p_tenant: user.tenant_id, p_order: orderId, p_payment: paymentId, p_reason: reason, p_expected_updated_at: expectedUpdatedAt })
  if (result.error) return { error: result.error.code === 'P0001' ? result.error.message : '取消できませんでした。再読み込みしてください' }
  for (const path of ['/admin', '/admin/orders', `/admin/orders/${orderId}`, '/admin/payments', '/admin/payment-verification']) revalidatePath(path)
  return { success: true }
}
