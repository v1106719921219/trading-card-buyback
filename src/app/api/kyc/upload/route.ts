import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadKycImage } from '@/lib/kyc/storage'
import { writeKycAuditLog } from '@/lib/kyc/audit'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_IMAGE_TYPES = ['id_front', 'id_thickness', 'id_back', 'face'] as const

export async function POST(request: NextRequest) {
  // Rate limiting
  const ip = request.headers.get('x-real-ip') ?? 'unknown'
  const rl = rateLimit(`kycUpload:${ip}`, RATE_LIMITS.kycUpload)
  if (!rl.success) {
    return NextResponse.json(
      { error: 'アップロードが多すぎます。しばらくしてからお試しください' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      }
    )
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const kycRequestId = formData.get('kyc_request_id') as string | null
    const imageType = formData.get('image_type') as string | null
    // 撮影時の画面状況（任意）。写りズレの原因調査用に監査ログへ残すだけで、動作には影響させない
    const captureMetaRaw = formData.get('capture_meta')
    let captureMeta: unknown = undefined
    if (typeof captureMetaRaw === 'string' && captureMetaRaw.length <= 1000) {
      try {
        captureMeta = JSON.parse(captureMetaRaw)
      } catch {
        captureMeta = undefined
      }
    }

    // バリデーション
    if (!file || !kycRequestId || !imageType) {
      return NextResponse.json({ error: '必須パラメータが不足しています' }, { status: 400 })
    }

    if (!ALLOWED_IMAGE_TYPES.includes(imageType as typeof ALLOWED_IMAGE_TYPES[number])) {
      return NextResponse.json({ error: '不正な画像タイプです' }, { status: 400 })
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'JPEG、PNG、WebPのみアップロード可能です' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'ファイルサイズは10MB以下にしてください' }, { status: 400 })
    }

    // KYCリクエストの存在確認・テナント検証
    const supabase = createAdminClient()
    const { data: kycRequest, error: fetchError } = await supabase
      .from('kyc_requests')
      .select('id, tenant_id, status')
      .eq('id', kycRequestId)
      .single()

    if (fetchError || !kycRequest) {
      return NextResponse.json({ error: 'KYCリクエストが見つかりません' }, { status: 404 })
    }

    if (kycRequest.status !== 'pending') {
      return NextResponse.json({ error: 'このリクエストは画像アップロードを受け付けていません' }, { status: 400 })
    }

    // ファイルをBufferに変換してアップロード
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { path, error: uploadError } = await uploadKycImage(
      kycRequest.tenant_id,
      kycRequestId,
      imageType as 'id_front' | 'id_back' | 'face',
      buffer,
      file.type
    )

    if (uploadError) {
      return NextResponse.json({ error: uploadError }, { status: 500 })
    }

    // KYCリクエストの画像パスを更新
    const updateField = imageType === 'id_front'
      ? 'id_front_image_path'
      : imageType === 'id_thickness'
        ? 'id_thickness_image_path'
        : imageType === 'id_back'
          ? 'id_back_image_path'
          : 'face_image_path'

    // 更新に失敗すると画像だけ保存されてパスが残らず、後から取り出せなくなる
    const { error: updateError } = await supabase
      .from('kyc_requests')
      .update({ [updateField]: path })
      .eq('id', kycRequestId)

    if (updateError) {
      console.error('[KYC Upload] path update error:', updateError)
      return NextResponse.json({ error: '画像の保存に失敗しました' }, { status: 500 })
    }

    // 監査ログ（awaitしないとレスポンス後に書き込みが残り、記録漏れ・順序ズレが起きる）
    await writeKycAuditLog({
      tenantId: kycRequest.tenant_id,
      kycRequestId,
      action: 'image_uploaded',
      details: {
        image_type: imageType,
        file_size: file.size,
        content_type: file.type,
        ...(captureMeta ? { capture: captureMeta } : {}),
      },
      ipAddress: ip,
      userAgent: request.headers.get('user-agent'),
    }).catch((err) => console.error('[KYC] Audit log error:', err))

    return NextResponse.json({ success: true, path })
  } catch (error) {
    console.error('[KYC Upload] Error:', error)
    return NextResponse.json({ error: 'アップロード処理に失敗しました' }, { status: 500 })
  }
}
