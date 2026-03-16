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
  const { customer_email, customer_name, id_document_type } = parsed.data

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

  const { user, error: authError } = await requireRole(['admin', 'manager'])
  if (authError || !user) return { error: authError ?? '認証エラー' }

  const supabase = await createClient()
  const { kyc_request_id, action, rejection_reason } = parsed.data

  // 現在のステータス確認
  const { data: current, error: fetchError } = await supabase
    .from('kyc_requests')
    .select('id, status, tenant_id')
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

  const { error: updateError } = await supabase
    .from('kyc_requests')
    .update({
      status: action,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: action === 'rejected' ? rejection_reason : null,
    })
    .eq('id', kyc_request_id)

  if (updateError) {
    return { error: sanitizeError(updateError) }
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
