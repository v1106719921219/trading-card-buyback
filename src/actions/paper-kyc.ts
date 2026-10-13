'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/security'
import { validPaymentDate } from '@/lib/payment-display'

const approvalSchema = z.object({
  orderId: z.uuid(), expectedUpdatedAt: z.string().min(1),
  receivedOn: z.string().refine(validPaymentDate), storageReference: z.string().trim().min(1).max(300),
  documentReceived: z.literal(true), identityMatched: z.literal(true), bankMatched: z.literal(true),
})

export async function getOrderPaperKyc(orderId: string) {
  const { user, error } = await requireRole(['admin', 'manager', 'staff'])
  if (error || !user) return { error: error ?? '認証が必要です' }
  if (!z.uuid().safeParse(orderId).success) return { error: '注文を確認してください' }
  const db = await createClient()
  const result = await db.from('order_paper_kyc')
    .select('id,received_on,storage_reference,verified_by,verified_at,revoked_at,revoke_reason')
    .eq('tenant_id', user.tenant_id).eq('order_id', orderId).order('verified_at', { ascending: false })
  if (result.error) return { error: '紙の本人確認履歴を取得できませんでした' }
  return { data: result.data }
}

export async function approveOrderPaperKyc(input: unknown) {
  const { user, error } = await requireRole(['admin', 'manager'])
  if (error || !user) return { error: error ?? '認証が必要です' }
  const parsed = approvalSchema.safeParse(input)
  if (!parsed.success) return { error: '受領日・保管場所・3つの確認項目を入力してください' }
  const v = parsed.data
  const db = await createClient()
  const result = await db.rpc('approve_order_paper_kyc', {
    p_tenant: user.tenant_id, p_order: v.orderId, p_received_on: v.receivedOn,
    p_storage_reference: v.storageReference, p_document_received: v.documentReceived,
    p_identity_matched: v.identityMatched, p_bank_matched: v.bankMatched,
    p_expected_updated_at: v.expectedUpdatedAt,
  })
  if (result.error) return { error: result.error.code === 'P0001' ? result.error.message : '承認できませんでした。再読み込みして確認してください' }
  for (const path of ['/admin/orders', `/admin/orders/${v.orderId}`, '/admin/payments', '/my-orders']) revalidatePath(path)
  return { success: true }
}

export async function revokeOrderPaperKyc(orderId: string, reason: string, expectedUpdatedAt: string) {
  const { user, error } = await requireRole(['admin'])
  if (error || !user) return { error: error ?? '認証が必要です' }
  if (!z.uuid().safeParse(orderId).success || !reason.trim() || reason.length > 500 || !expectedUpdatedAt) return { error: '注文と取消理由を確認してください' }
  const db = await createClient()
  const result = await db.rpc('revoke_order_paper_kyc', { p_tenant: user.tenant_id, p_order: orderId, p_reason: reason.trim(), p_expected_updated_at: expectedUpdatedAt })
  if (result.error) return { error: result.error.code === 'P0001' ? result.error.message : '取消できませんでした。再読み込みしてください' }
  for (const path of ['/admin/orders', `/admin/orders/${orderId}`, '/admin/payments', '/my-orders']) revalidatePath(path)
  return { success: true }
}
