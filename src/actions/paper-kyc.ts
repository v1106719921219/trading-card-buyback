'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/security'
import { validPaymentDate } from '@/lib/payment-display'
import { sanitizeImage } from '@/lib/safe-image'
import { createSignedUrl, uploadPaperKycImage } from '@/lib/kyc/storage'

const approvalSchema = z.object({
  orderId: z.uuid(), expectedUpdatedAt: z.string().min(1), documentType: z.enum(PAPER_DOCUMENT_TYPES),
  receivedOn: z.string().refine(validPaymentDate), storageReference: z.string().trim().min(1).max(300),
  documentReceived: z.literal(true), identityMatched: z.literal(true), bankMatched: z.literal(true),
})

export async function getOrderPaperKyc(orderId: string) {
  const { user, error } = await requireRole(['admin', 'manager', 'staff'])
  if (error || !user) return { error: error ?? '認証が必要です' }
  if (!z.uuid().safeParse(orderId).success) return { error: '注文を確認してください' }
  const db = await createClient()
  const result = await db.from('order_paper_kyc')
    .select('id,document_type,received_on,storage_reference,verified_by,verified_at,revoked_at,revoke_reason')
    .eq('tenant_id', user.tenant_id).eq('order_id', orderId).order('verified_at', { ascending: false })
  if (result.error) return { error: '紙の本人確認履歴を取得できませんでした' }
  return { data: result.data }
}

// スタッフも承認できる（eKYCの承認と同じ）。DB側でも役割と二段階認証を再確認する
export async function approveOrderPaperKyc(input: unknown) {
  const { user, error } = await requireRole(['admin', 'manager', 'staff'])
  if (error || !user) return { error: error ?? '認証が必要です' }
  const parsed = approvalSchema.safeParse(input)
  if (!parsed.success) return { error: '書類の種類・受領日・保管場所・3つの確認項目を入力してください' }
  const v = parsed.data
  const db = await createClient()
  const result = await db.rpc('approve_order_paper_kyc', {
    p_tenant: user.tenant_id, p_order: v.orderId, p_document_type: v.documentType, p_received_on: v.receivedOn,
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

// ============================================================================
// 紙で受領した書類の画像（スキャン/写真）
// 承認とは独立に、受領したスタッフが注文に紐づけて保存する。承認の可否・条件は変えない。
// ============================================================================

import { PAPER_DOC_LABELS, PAPER_DOCUMENT_TYPES, type PaperDocLabel } from '@/lib/kyc/paper-docs'
const MAX_DOC_BYTES = 10 * 1024 * 1024
const MAX_DOCS_PER_ORDER = 8
const PAID_STATUSES = ['振込済', '振込確認済']

export type PaperKycDocument = { id: string; label: PaperDocLabel; url: string; uploaded_at: string }

export async function getPaperKycDocuments(orderId: string): Promise<{ data?: PaperKycDocument[]; error?: string }> {
  const { user, error } = await requireRole(['admin', 'manager', 'staff'])
  if (error || !user) return { error: error ?? '認証が必要です' }
  if (!z.uuid().safeParse(orderId).success) return { error: '注文を確認してください' }
  // 一覧はRLS経由（閲覧条件はDB側のポリシーに任せる）。署名付きURLだけサーバー権限で発行する
  const db = await createClient()
  const result = await db.from('order_paper_kyc_documents')
    .select('id,label,storage_path,uploaded_at')
    .eq('tenant_id', user.tenant_id).eq('order_id', orderId).order('uploaded_at', { ascending: true })
  if (result.error) return { error: '書類画像の一覧を取得できませんでした' }
  const data: PaperKycDocument[] = []
  for (const row of result.data) {
    const url = await createSignedUrl(row.storage_path)
    if (url) data.push({ id: row.id, label: row.label as PaperDocLabel, url, uploaded_at: row.uploaded_at })
  }
  return { data }
}

export async function uploadPaperKycDocument(formData: FormData) {
  const { user, error } = await requireRole(['admin', 'manager', 'staff'])
  if (error || !user) return { error: error ?? '認証が必要です' }

  const orderId = formData.get('order_id')
  const label = formData.get('label')
  const file = formData.get('file')
  if (typeof orderId !== 'string' || !z.uuid().safeParse(orderId).success) return { error: '注文を確認してください' }
  if (typeof label !== 'string' || !(PAPER_DOC_LABELS as readonly string[]).includes(label)) return { error: '書類の面（表面・裏面・その他）を選んでください' }
  if (!file || typeof file === 'string' || typeof (file as Blob).arrayBuffer !== 'function') return { error: '画像ファイルを選んでください' }
  const blob = file as Blob
  if (blob.size === 0) return { error: '画像ファイルが空です' }
  if (blob.size > MAX_DOC_BYTES) return { error: 'ファイルサイズは10MB以下にしてください' }

  const admin = createAdminClient()
  const { data: order } = await admin.from('orders').select('id,status')
    .eq('id', orderId).eq('tenant_id', user.tenant_id).maybeSingle()
  if (!order) return { error: '注文が見つかりません' }
  if (PAID_STATUSES.includes(order.status)) return { error: '支払い済みの注文には書類画像を追加できません' }

  const { count } = await admin.from('order_paper_kyc_documents').select('id', { count: 'exact', head: true })
    .eq('tenant_id', user.tenant_id).eq('order_id', orderId)
  if ((count ?? 0) >= MAX_DOCS_PER_ORDER) return { error: `書類画像は1注文につき${MAX_DOCS_PER_ORDER}枚までです` }

  let buffer: Buffer
  try {
    buffer = await sanitizeImage(Buffer.from(await blob.arrayBuffer()), MAX_DOC_BYTES)
  } catch (e) {
    return { error: e instanceof Error ? e.message : '画像を処理できませんでした' }
  }

  const { path, error: uploadError } = await uploadPaperKycImage(user.tenant_id, orderId, label as PaperDocLabel, buffer)
  if (uploadError) return { error: uploadError }

  const inserted = await admin.from('order_paper_kyc_documents')
    .insert({ tenant_id: user.tenant_id, order_id: orderId, label, storage_path: path, uploaded_by: user.id })
    .select('id').single()
  if (inserted.error) {
    // 行が残らないと画像を取り出せなくなるので、保存した画像も消して整合を保つ
    await admin.storage.from('kyc-documents').remove([path]).catch(() => {})
    return { error: '書類画像の登録に失敗しました' }
  }

  const { error: auditError } = await admin.from('security_audit_events').insert({
    tenant_id: user.tenant_id, actor_id: user.id, action: 'paper_kyc_document_uploaded', record_id: orderId,
    details: { document_id: inserted.data.id, label, bytes: buffer.length },
  })
  if (auditError) console.error('[SECURITY] Paper KYC document audit could not be saved')

  revalidatePath(`/admin/orders/${orderId}`)
  return { success: true }
}

export async function deletePaperKycDocument(documentId: string) {
  const { user, error } = await requireRole(['admin'])
  if (error || !user) return { error: error ?? '認証が必要です' }
  if (!z.uuid().safeParse(documentId).success) return { error: '書類画像を確認してください' }

  const admin = createAdminClient()
  const { data: doc } = await admin.from('order_paper_kyc_documents').select('id,order_id,storage_path,label')
    .eq('id', documentId).eq('tenant_id', user.tenant_id).maybeSingle()
  if (!doc) return { error: '書類画像が見つかりません' }
  const { data: order } = await admin.from('orders').select('status').eq('id', doc.order_id).eq('tenant_id', user.tenant_id).maybeSingle()
  if (order && PAID_STATUSES.includes(order.status)) return { error: '支払い済みの注文の書類画像は削除できません' }

  const deleted = await admin.from('order_paper_kyc_documents').delete().eq('id', doc.id).eq('tenant_id', user.tenant_id)
  if (deleted.error) return { error: '削除できませんでした' }
  await admin.storage.from('kyc-documents').remove([doc.storage_path]).catch(() => {})

  const { error: auditError } = await admin.from('security_audit_events').insert({
    tenant_id: user.tenant_id, actor_id: user.id, action: 'paper_kyc_document_deleted', record_id: doc.order_id,
    details: { document_id: doc.id, label: doc.label },
  })
  if (auditError) console.error('[SECURITY] Paper KYC document audit could not be saved')

  revalidatePath(`/admin/orders/${doc.order_id}`)
  return { success: true }
}
