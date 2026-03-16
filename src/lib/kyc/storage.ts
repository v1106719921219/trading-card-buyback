import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'kyc-documents'

/**
 * KYC画像をStorageにアップロード
 * adminClientを使用（公開ユーザーはSupabase Authアカウントなし）
 */
export async function uploadKycImage(
  tenantId: string,
  kycRequestId: string,
  imageType: 'id_front' | 'id_thickness' | 'id_back' | 'face',
  file: Buffer,
  contentType: string
): Promise<{ path: string; error: string | null }> {
  const supabase = createAdminClient()
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'
  const path = `${tenantId}/${kycRequestId}/${imageType}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType,
      upsert: true,
    })

  if (error) {
    console.error('[KYC Storage] Upload error:', error)
    return { path: '', error: 'ファイルのアップロードに失敗しました' }
  }

  return { path, error: null }
}

/**
 * 署名付きURLを生成（管理者が画像を閲覧する際に使用）
 */
export async function createSignedUrl(
  path: string,
  expiresIn: number = 300 // 5分
): Promise<string | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn)

  if (error) {
    console.error('[KYC Storage] Signed URL error:', error)
    return null
  }

  return data.signedUrl
}

/**
 * KYCリクエストに関連する全画像を削除
 */
export async function deleteKycImages(
  tenantId: string,
  kycRequestId: string
): Promise<void> {
  const supabase = createAdminClient()
  const prefix = `${tenantId}/${kycRequestId}/`

  const { data: files } = await supabase.storage
    .from(BUCKET)
    .list(prefix.slice(0, -1)) // list はスラッシュなしのプレフィックス

  if (files && files.length > 0) {
    const paths = files.map((f) => `${prefix}${f.name}`)
    await supabase.storage.from(BUCKET).remove(paths)
  }
}
