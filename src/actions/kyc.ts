'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenantId, getTenant } from '@/lib/tenant'
import { requireRole, sanitizeError } from '@/lib/security'
import { kycSubmitSchema, kycReviewSchema } from '@/lib/validators/kyc'
import { writeKycAuditLog } from '@/lib/kyc/audit'
import { createSignedUrl } from '@/lib/kyc/storage'
import { runOcr } from '@/lib/kyc/ocr'
import { runFaceMatch } from '@/lib/kyc/face-match'
import type { KycSubmitInput, KycReviewInput } from '@/lib/validators/kyc'
import type { KycRequest, KycStatus } from '@/types/kyc'

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
  const { customer_email, customer_name, id_document_type, order_number } = parsed.data

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

  // 同一メールの未完了リクエストがあるか確認
  const { data: existing } = await supabase
    .from('kyc_requests')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .eq('customer_email', customer_email)
    .in('status', ['pending', 'processing'])
    .limit(1)
    .single()

  if (existing) {
    // 既存の未完了リクエストを削除して作り直す
    await supabase.from('kyc_audit_logs').delete().eq('kyc_request_id', existing.id)
    await supabase.from('kyc_requests').delete().eq('id', existing.id)
  }

  const { data: kycRequest, error } = await supabase
    .from('kyc_requests')
    .insert({
      tenant_id: tenantId,
      customer_email,
      customer_name,
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

  // OCR・顔認証スタブ実行（Phase 2で実API統合）
  const [ocrResult, faceMatchResult] = await Promise.all([
    runOcr(kycRequest.id_front_image_path),
    runFaceMatch(kycRequest.id_front_image_path, kycRequest.face_image_path),
  ])

  const { error: updateError } = await supabase
    .from('kyc_requests')
    .update({
      status: 'processing',
      ocr_result: ocrResult.raw,
      ocr_extracted_name: ocrResult.name,
      ocr_extracted_address: ocrResult.address,
      ocr_extracted_birth_date: ocrResult.birthDate,
      face_match_score: faceMatchResult.score,
      face_match_passed: faceMatchResult.passed,
    })
    .eq('id', kycRequestId)

  if (updateError) {
    return { error: sanitizeError(updateError) }
  }

  // 監査ログ
  writeKycAuditLog({
    tenantId,
    kycRequestId,
    action: 'request_submitted',
    details: {
      ocr_stub: true,
      face_match_stub: true,
    },
  }).catch((err) => console.error('[KYC] Audit log error:', err))

  return { success: true }
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
  }

  if (options?.search) {
    query = query.or(
      `customer_email.ilike.%${options.search}%,customer_name.ilike.%${options.search}%`
    )
  }

  const { data, count, error } = await query

  if (error) {
    return { error: sanitizeError(error) }
  }

  return { data: data as KycRequest[], count: count ?? 0 }
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

  return { data: data as KycRequest }
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
    .select('id, tenant_id, customer_email, customer_identity_method, kyc_request_id, identity_verified_at')
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
  } | null = null

  const kycSelect =
    'id, status, id_document_type, id_front_image_path, id_back_image_path, id_thickness_image_path, face_image_path, rejection_reason, reviewed_at'

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
  if (!kyc) {
    const { data } = await supabase
      .from('kyc_requests')
      .select(kycSelect)
      .eq('tenant_id', order.tenant_id)
      .eq('customer_email', order.customer_email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    kyc = data
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
        ? (await import('@/types/kyc')).ID_DOCUMENT_TYPE_LABELS[
            kyc.id_document_type as import('@/types/kyc').IdDocumentType
          ] ?? kyc.id_document_type
        : null,
      rejectionReason: kyc?.rejection_reason ?? null,
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
