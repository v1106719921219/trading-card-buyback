'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenantId, getTenant } from '@/lib/tenant'
import { requireRole, sanitizeError } from '@/lib/security'
import { kycSubmitSchema, kycReviewSchema } from '@/lib/validators/kyc'
import { writeKycAuditLog } from '@/lib/kyc/audit'
import { createSignedUrl } from '@/lib/kyc/storage'
import { runAiKycReview, type AiKycReview } from '@/lib/kyc/ai-review'
import { ID_DOCUMENT_TYPE_LABELS } from '@/types/kyc'
import type { KycSubmitInput, KycReviewInput } from '@/lib/validators/kyc'
import type { KycRequest, KycRequestWithOrder, KycStatus } from '@/types/kyc'

/**
 * 新規KYCリクエスト作成（公開フォームから）
 */
export async function createKycRequest(input: KycSubmitInput) {
  const parsed = kycSubmitSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  let tenantId: string
  try {
    tenantId = await requireTenantId()
  } catch {
    return { error: 'テナント情報の取得に失敗しました' }
  }

  // eKYC有効チェック
  const tenant = await getTenant()
  if (!tenant || !tenant.ekyc_enabled) {
    return { error: 'eKYC機能は現在利用できません' }
  }

  const supabase = createAdminClient()
  const { customer_email, customer_name, id_document_type, order_number, line_id_token } = parsed.data

  // LINE本人（line_user_id）を復元。以降のeKYC照合はメールではなくこれで行う
  let lineUserId: string | null = null
  if (line_id_token) {
    const { verifyLineIdToken } = await import('@/lib/line-verify')
    const verified = await verifyLineIdToken(line_id_token)
    lineUserId = verified?.userId ?? null
  }

  // 注文番号が渡された場合は注文に紐付ける（同一テナントのみ）
  let orderId: string | null = null
  if (order_number) {
    const { data: order } = await supabase
      .from('orders')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('order_number', order_number)
      .maybeSingle()
    orderId = order?.id ?? null
  }

  // 同一LINE本人の未完了リクエストがあれば作り直す（LINE未連携時はメールで代替）
  let existingQuery = supabase
    .from('kyc_requests')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .in('status', ['pending', 'processing'])
    .limit(1)
  existingQuery = lineUserId
    ? existingQuery.eq('line_user_id', lineUserId)
    : existingQuery.eq('customer_email', customer_email ?? '')
  const { data: existing } = await existingQuery.maybeSingle()

  if (existing) {
    // 既存の未完了リクエストを削除して作り直す
    await supabase.from('kyc_audit_logs').delete().eq('kyc_request_id', existing.id)
    await supabase.from('kyc_requests').delete().eq('id', existing.id)
  }

  const { data: kycRequest, error } = await supabase
    .from('kyc_requests')
    .insert({
      tenant_id: tenantId,
      customer_email: customer_email ?? null,
      customer_name,
      line_user_id: lineUserId,
      id_document_type,
      order_id: orderId,
      kyc_method: 'image',
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) {
    return { error: sanitizeError(error) }
  }

  // 監査ログ
  writeKycAuditLog({
    tenantId,
    kycRequestId: kycRequest.id,
    action: 'request_created',
    details: { customer_email, id_document_type },
  }).catch((err) => console.error('[KYC] Audit log error:', err))

  return { success: true, kyc_request_id: kycRequest.id }
}

/**
 * 全画像アップロード完了後にステータスを processing に更新
 */
export async function submitKycRequest(kycRequestId: string) {
  let tenantId: string
  try {
    tenantId = await requireTenantId()
  } catch {
    return { error: 'テナント情報の取得に失敗しました' }
  }

  const supabase = createAdminClient()

  // リクエスト取得・テナント検証
  const { data: kycRequest, error: fetchError } = await supabase
    .from('kyc_requests')
    .select('*')
    .eq('id', kycRequestId)
    .eq('tenant_id', tenantId)
    .single()

  if (fetchError || !kycRequest) {
    return { error: 'KYCリクエストが見つかりません' }
  }

  if (kycRequest.status !== 'pending') {
    return { error: 'このリクエストは送信済みです' }
  }

  // 必須画像の存在チェック
  if (!kycRequest.id_front_image_path || !kycRequest.face_image_path) {
    return { error: '必要な画像がアップロードされていません' }
  }

  try {
    const { error: updateError } = await supabase
      .from('kyc_requests')
      .update({ status: 'processing' })
      .eq('id', kycRequestId)

    if (updateError) {
      return { error: sanitizeError(updateError) }
    }

    // 監査ログ
    writeKycAuditLog({
      tenantId,
      kycRequestId,
      action: 'request_submitted',
      details: {},
    }).catch((err) => console.error('[KYC] Audit log error:', err))

    // AI自動審査（レスポンス返却後にバックグラウンドで実行。問題なければ自動承認、疑義があれば人間の確認待ち）
    after(async () => {
      await runAiReviewAndApply(kycRequestId, tenantId).catch((err) =>
        console.error('[KYC AI] バックグラウンド審査エラー:', err)
      )
    })

    return { success: true }
  } catch (err) {
    console.error('[submitKycRequest] エラー:', err)
    return { error: '送信中にエラーが発生しました。もう一度お試しください' }
  }
}

/** AI審査を実行し、結果をkyc_requestsに反映する（pass=自動承認、それ以外=人間確認待ちのまま） */
async function runAiReviewAndApply(kycRequestId: string, tenantId: string) {
  const supabase = createAdminClient()

  const { data: kyc } = await supabase
    .from('kyc_requests')
    .select('*')
    .eq('id', kycRequestId)
    .single()

  if (!kyc || kyc.status !== 'processing') return

  const review: AiKycReview | null = await runAiKycReview({
    expectedName: kyc.customer_name,
    documentTypeLabel:
      ID_DOCUMENT_TYPE_LABELS[kyc.id_document_type as keyof typeof ID_DOCUMENT_TYPE_LABELS] ??
      kyc.id_document_type,
    imagePaths: [
      { label: '身分証（表面）', path: kyc.id_front_image_path },
      { label: '身分証（裏面）', path: kyc.id_back_image_path },
      { label: '身分証の厚み', path: kyc.id_thickness_image_path },
      { label: '顔写真（自撮り）', path: kyc.face_image_path },
    ].filter((i) => i.path),
  })

  if (!review) {
    // AI実行不可 → 従来通り人間の確認待ちのまま
    writeKycAuditLog({
      tenantId,
      kycRequestId,
      action: 'ai_review_skipped',
      details: { reason: 'AI審査を実行できなかったため人間の確認待ち' },
    }).catch(() => {})
    return
  }

  const autoApprove = review.verdict === 'pass'

  const { data: updated } = await supabase
    .from('kyc_requests')
    .update({
      ocr_result: { ai: review },
      ocr_extracted_name: review.extracted_name,
      ocr_extracted_address: review.extracted_address,
      ocr_extracted_birth_date: review.extracted_birth_date,
      face_match_passed: review.face_match,
      ...(autoApprove
        ? { status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: null }
        : {}),
    })
    .eq('id', kycRequestId)
    .eq('status', 'processing')
    .select('id, order_id')

  if (!updated || updated.length === 0) return

  if (autoApprove && updated[0].order_id) {
    await supabase
      .from('orders')
      .update({
        kyc_request_id: kycRequestId,
        identity_verified_at: new Date().toISOString(),
      })
      .eq('id', updated[0].order_id)
  }

  writeKycAuditLog({
    tenantId,
    kycRequestId,
    action: autoApprove ? 'ai_auto_approved' : 'ai_needs_review',
    details: {
      summary: review.summary,
      concerns: review.concerns,
      name_match: review.name_match,
      face_match: review.face_match,
    },
  }).catch(() => {})
}

/**
 * ステータス確認（公開ページ）
 */
export async function getKycStatus(customerEmail: string) {
  let tenantId: string
  try {
    tenantId = await requireTenantId()
  } catch {
    return { error: 'テナント情報の取得に失敗しました' }
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('kyc_requests')
    .select('id, status, id_document_type, rejection_reason, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .eq('customer_email', customerEmail)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    return { data: null }
  }

  return { data }
}

/**
 * 一覧取得（管理画面、RLS使用）
 */
export async function getKycRequests(options?: {
  status?: KycStatus
  search?: string
  page?: number
  limit?: number
}) {
  const { user, error: authError } = await requireRole(['admin', 'manager', 'staff'])
  if (authError || !user) return { error: authError ?? '認証エラー' }

  const supabase = await createClient()
  const page = options?.page ?? 1
  const limit = options?.limit ?? 20
  const offset = (page - 1) * limit

  let query = supabase
    .from('kyc_requests')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (options?.status) {
    query = query.eq('status', options.status)
  } else {
    // 既定では「画像アップロード待ち（pending＝撮影せず離脱した未完了）」を除外し、
    // 対応が必要な分だけ表示する。ステータスで明示選択すれば表示可能
    query = query.neq('status', 'pending')
  }

  if (options?.search) {
    query = query.or(
      `customer_name.ilike.%${options.search}%`
    )
  }

  const { data, count, error } = await query

  if (error) {
    return { error: sanitizeError(error) }
  }

  // 紐付く注文番号を付ける。千葉DBは orders.kyc_request_id に外部キーが無く
  // PostgRESTの結合が使えないため、別クエリで引いてJS側で突き合わせる
  const rows = (data ?? []) as KycRequest[]
  const ids = rows.map((r) => r.id)
  const orderIds = rows.map((r) => r.order_id).filter(Boolean) as string[]
  const byKycId = new Map<string, { id: string; order_number: string }>()
  const byOrderId = new Map<string, { id: string; order_number: string }>()

  if (ids.length > 0) {
    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_number, kyc_request_id')
      .in('kyc_request_id', ids)
    for (const o of orders ?? []) {
      if (o.kyc_request_id) byKycId.set(o.kyc_request_id, { id: o.id, order_number: o.order_number })
    }
  }
  if (orderIds.length > 0) {
    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_number')
      .in('id', orderIds)
    for (const o of orders ?? []) byOrderId.set(o.id, { id: o.id, order_number: o.order_number })
  }

  const withOrder = rows.map((r) => ({
    ...r,
    order: byKycId.get(r.id) ?? (r.order_id ? byOrderId.get(r.order_id) : undefined) ?? null,
  }))

  return { data: withOrder as KycRequestWithOrder[], count: count ?? 0 }
}

/**
 * 詳細取得（管理画面）
 */
export async function getKycRequest(id: string) {
  const { user, error: authError } = await requireRole(['admin', 'manager', 'staff'])
  if (authError || !user) return { error: authError ?? '認証エラー' }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('kyc_requests')
    .select('*, reviewer:reviewed_by(id, display_name)')
    .eq('id', id)
    .single()

  if (error) {
    return { error: sanitizeError(error) }
  }

  // 紐付く注文（注文番号・詳細リンク用のid）。千葉DBは外部キーが無いので別クエリで引く
  const row = data as KycRequest
  let order: { id: string; order_number: string } | null = null
  const { data: byKyc } = await supabase
    .from('orders')
    .select('id, order_number')
    .eq('kyc_request_id', row.id)
    .maybeSingle()
  order = byKyc ?? null
  if (!order && row.order_id) {
    const { data: byId } = await supabase
      .from('orders')
      .select('id, order_number')
      .eq('id', row.order_id)
      .maybeSingle()
    order = byId ?? null
  }

  return { data: { ...row, order } as KycRequestWithOrder }
}

/**
 * 署名付きURL生成（管理画面で画像閲覧）
 */
export async function getKycImageUrl(path: string) {
  const { user, error: authError } = await requireRole(['admin', 'manager', 'staff'])
  if (authError || !user) return { error: authError ?? '認証エラー' }

  const url = await createSignedUrl(path)
  if (!url) {
    return { error: '画像URLの生成に失敗しました' }
  }

  return { url }
}

/**
 * 承認/否認（管理画面）
 */
export async function reviewKycRequest(input: KycReviewInput) {
  const parsed = kycReviewSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  // 検品時にスタッフが確認できるようstaffもレビュー可能（実行者はreviewed_by＋監査ログに記録）
  const { user, error: authError } = await requireRole(['admin', 'manager', 'staff'])
  if (authError || !user) return { error: authError ?? '認証エラー' }

  const supabase = await createClient()
  const { kyc_request_id, action, rejection_reason } = parsed.data

  // 現在のステータス確認
  const { data: current, error: fetchError } = await supabase
    .from('kyc_requests')
    .select('id, status, tenant_id, order_id')
    .eq('id', kyc_request_id)
    .single()

  if (fetchError || !current) {
    return { error: 'KYCリクエストが見つかりません' }
  }

  if (current.status !== 'processing') {
    return { error: '審査中のリクエストのみレビューできます' }
  }

  if (action === 'rejected' && !rejection_reason) {
    return { error: '否認理由を入力してください' }
  }

  const { data: updated, error: updateError } = await supabase
    .from('kyc_requests')
    .update({
      status: action,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: action === 'rejected' ? rejection_reason : null,
    })
    .eq('id', kyc_request_id)
    .select('id')

  if (updateError) {
    return { error: sanitizeError(updateError) }
  }
  if (!updated || updated.length === 0) {
    return { error: 'レビューの保存に失敗しました（権限がない可能性があります）' }
  }

  // 承認時: 紐付いた注文を本人確認済みにする
  if (action === 'approved' && current.order_id) {
    const admin = createAdminClient()
    const { error: orderError } = await admin
      .from('orders')
      .update({
        kyc_request_id,
        identity_verified_at: new Date().toISOString(),
      })
      .eq('id', current.order_id)
    if (orderError) {
      console.error('[KYC] 注文への確認済み反映に失敗:', orderError)
    }
  }

  // 監査ログ
  writeKycAuditLog({
    tenantId: current.tenant_id,
    kycRequestId: kyc_request_id,
    actorId: user.id,
    action: action === 'approved' ? 'request_approved' : 'request_rejected',
    details: {
      reviewer: user.display_name ?? user.email,
      rejection_reason: action === 'rejected' ? rejection_reason : undefined,
    },
  }).catch((err) => console.error('[KYC] Audit log error:', err))

  revalidatePath('/admin/kyc')
  revalidatePath(`/admin/kyc/${kyc_request_id}`)

  return { success: true }
}

/**
 * 申込フォーム用: このメール＋氏名の本人確認状況を返す
 * verified = 承認済み（自動スキップ可） / submitted = 提出済み（審査中） / none = 未提出
 */
export async function checkKycForApply(
  lineIdToken: string,
  name: string
): Promise<'verified' | 'submitted' | 'none'> {
  try {
    if (!lineIdToken || !name) return 'none'
    // LINE本人（line_user_id）でのみ照合。LINE連携していない場合は毎回eKYC必須（'none'）
    const { verifyLineIdToken } = await import('@/lib/line-verify')
    const verified = await verifyLineIdToken(lineIdToken)
    const lineUserId = verified?.userId
    if (!lineUserId) return 'none'

    const tenantId = await requireTenantId()
    const supabase = createAdminClient()
    const normalize = (s: string | null | undefined) => (s ?? '').replace(/[\s　]/g, '')

    const { data } = await supabase
      .from('kyc_requests')
      .select('status, customer_name')
      .eq('tenant_id', tenantId)
      .eq('line_user_id', lineUserId)
      .in('status', ['approved', 'processing'])
      .order('created_at', { ascending: false })
      .limit(10)

    const matched = (data ?? []).filter((k) => normalize(k.customer_name) === normalize(name))
    if (matched.some((k) => k.status === 'approved')) return 'verified'
    if (matched.some((k) => k.status === 'processing')) return 'submitted'
    return 'none'
  } catch {
    return 'none'
  }
}

/**
 * eKYCアップロード案内の本番展開フラグ（公開ページから参照）
 * app_settings: ekyc_rollout_enabled = 'true' で申込完了画面にアップロード案内を表示
 */
export async function getEkycRolloutEnabled(): Promise<boolean> {
  try {
    const tenantId = await requireTenantId()
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('tenant_id', tenantId)
      .eq('key', 'ekyc_rollout_enabled')
      .maybeSingle()
    return data?.value === 'true'
  } catch {
    return false
  }
}

/**
 * 検品画面用: 注文に対応する本人確認（eKYC）の状況と書類画像を取得
 * 紐付き順: 注文に記録されたkyc_request_id → 注文idに紐付くリクエスト → 同一メールの最新リクエスト
 */
export async function getOrderKycInfo(orderId: string) {
  const { user, error: authError } = await requireRole(['admin', 'manager', 'staff'])
  if (authError || !user) return { error: authError ?? '認証エラー' }

  const supabase = createAdminClient()

  const { data: order } = await supabase
    .from('orders')
    .select('id, tenant_id, customer_name, line_user_id, customer_identity_method, kyc_request_id, identity_verified_at')
    .eq('id', orderId)
    .single()

  if (!order) return { error: '注文が見つかりません' }

  let kyc: {
    id: string
    status: string
    id_document_type: string
    id_front_image_path: string | null
    id_back_image_path: string | null
    id_thickness_image_path: string | null
    face_image_path: string | null
    rejection_reason: string | null
    reviewed_at: string | null
    reviewed_by: string | null
    ocr_result: { ai?: AiKycReview } | null
  } | null = null

  const kycSelect =
    'id, status, id_document_type, id_front_image_path, id_back_image_path, id_thickness_image_path, face_image_path, rejection_reason, reviewed_at, reviewed_by, ocr_result'

  if (order.kyc_request_id) {
    const { data } = await supabase
      .from('kyc_requests')
      .select(kycSelect)
      .eq('id', order.kyc_request_id)
      .maybeSingle()
    kyc = data
  }
  if (!kyc) {
    const { data } = await supabase
      .from('kyc_requests')
      .select(kycSelect)
      .eq('order_id', order.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    kyc = data
  }
  if (!kyc && order.line_user_id) {
    // メール廃止後の最終フォールバック: 同じLINE本人＋氏名一致の最新eKYC
    const { data } = await supabase
      .from('kyc_requests')
      .select(`${kycSelect}, customer_name`)
      .eq('tenant_id', order.tenant_id)
      .eq('line_user_id', order.line_user_id)
      .order('created_at', { ascending: false })
      .limit(10)
    const norm = (s: string | null | undefined) => (s ?? '').replace(/[\s　]/g, '')
    kyc = (data ?? []).find((k) => norm(k.customer_name) === norm(order.customer_name)) ?? null
  }

  const images: { label: string; url: string }[] = []
  if (kyc) {
    const paths: [string, string | null][] = [
      ['身分証（表）', kyc.id_front_image_path],
      ['身分証（裏）', kyc.id_back_image_path],
      ['厚み', kyc.id_thickness_image_path],
      ['顔写真', kyc.face_image_path],
    ]
    for (const [label, path] of paths) {
      if (!path) continue
      const url = await createSignedUrl(path)
      if (url) images.push({ label, url })
    }
  }

  return {
    data: {
      identityMethod: order.customer_identity_method,
      identityVerifiedAt: order.identity_verified_at,
      kycId: kyc?.id ?? null,
      kycStatus: (kyc?.status as import('@/types/kyc').KycStatus) ?? null,
      documentLabel: kyc
        ? ID_DOCUMENT_TYPE_LABELS[
            kyc.id_document_type as keyof typeof ID_DOCUMENT_TYPE_LABELS
          ] ?? kyc.id_document_type
        : null,
      rejectionReason: kyc?.rejection_reason ?? null,
      aiReview: kyc?.ocr_result?.ai ?? null,
      autoApproved: kyc?.status === 'approved' && !kyc?.reviewed_by,
      images,
    },
  }
}

/**
 * 監査ログ取得（管理画面）
 */
export async function getKycAuditLogs(kycRequestId: string) {
  const { user, error: authError } = await requireRole(['admin', 'manager'])
  if (authError || !user) return { error: authError ?? '認証エラー' }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('kyc_audit_logs')
    .select('*, actor:actor_id(id, display_name)')
    .eq('kyc_request_id', kycRequestId)
    .order('created_at', { ascending: true })

  if (error) {
    return { error: sanitizeError(error) }
  }

  return { data: data as import('@/types/kyc').KycAuditLog[] }
}

/**
 * この管理画面でeKYC削除ボタンを出してよいか（千葉店テナントのみ許可）。
 * 東京（本番・実顧客あり）では本人確認記録を消せないようにする安全策。
 */
export async function getKycDeletable(): Promise<boolean> {
  try {
    const tenant = await getTenant()
    return tenant?.slug === 'chiba'
  } catch {
    return false
  }
}

/**
 * eKYCリクエストを削除する（千葉店のみ）。画像・監査ログも合わせて削除。
 * 紐づく注文のkyc_request_idはON DELETE SET NULLで自動的に外れる（注文自体は消さない）。
 */
export async function deleteKycRequest(id: string) {
  const { error: authError } = await requireRole(['admin', 'manager', 'staff'])
  if (authError) return { error: authError }

  const tenant = await getTenant()
  if (!tenant) return { error: 'テナント情報を取得できません' }
  if (tenant.slug !== 'chiba') {
    return { error: 'この操作は千葉店でのみ可能です' }
  }

  const supabase = createAdminClient()
  // 同一テナントのリクエストのみ対象。画像パスも取得
  const { data: kyc, error: fetchError } = await supabase
    .from('kyc_requests')
    .select('id, id_front_image_path, id_thickness_image_path, id_back_image_path, face_image_path')
    .eq('id', id)
    .eq('tenant_id', tenant.id)
    .maybeSingle()

  // DBエラー（列が無い等）を「見つかりません」で握り潰すと原因が分からなくなる
  if (fetchError) return { error: sanitizeError(fetchError) }
  if (!kyc) return { error: '対象の本人確認が見つかりません' }

  // 画像削除
  const paths = [
    kyc.id_front_image_path,
    kyc.id_thickness_image_path,
    kyc.id_back_image_path,
    kyc.face_image_path,
  ].filter(Boolean) as string[]
  if (paths.length > 0) {
    await supabase.storage.from('kyc-documents').remove(paths).catch(() => {})
  }

  await supabase.from('kyc_audit_logs').delete().eq('kyc_request_id', id)
  const { error } = await supabase
    .from('kyc_requests')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenant.id)

  if (error) return { error: sanitizeError(error) }

  revalidatePath('/admin/kyc')
  return { success: true }
}
