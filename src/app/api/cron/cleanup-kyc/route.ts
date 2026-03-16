import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteKycImages } from '@/lib/kyc/storage'
import { writeKycAuditLog } from '@/lib/kyc/audit'

export async function GET(request: Request) {
  // Vercel Cron認証
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  const results = { expired: 0, imagesDeleted: 0, archivedDeleted: 0 }

  // 1. 90日以上 pending/processing → expired に更新
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { data: expiredRequests } = await supabase
    .from('kyc_requests')
    .select('id, tenant_id')
    .in('status', ['pending', 'processing'])
    .lt('created_at', ninetyDaysAgo)

  if (expiredRequests && expiredRequests.length > 0) {
    const ids = expiredRequests.map((r) => r.id)
    await supabase
      .from('kyc_requests')
      .update({ status: 'expired' })
      .in('id', ids)

    results.expired = expiredRequests.length

    for (const req of expiredRequests) {
      writeKycAuditLog({
        tenantId: req.tenant_id,
        kycRequestId: req.id,
        action: 'cleanup_expired',
        details: { reason: '90日間未完了のため期限切れ' },
      }).catch(() => {})
    }
  }

  // 2. 120日以上 expired → 画像をストレージから削除
  const oneHundredTwentyDaysAgo = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString()
  const { data: expiredWithImages } = await supabase
    .from('kyc_requests')
    .select('id, tenant_id')
    .eq('status', 'expired')
    .lt('created_at', oneHundredTwentyDaysAgo)
    .or('id_front_image_path.not.is.null,id_back_image_path.not.is.null,id_thickness_image_path.not.is.null,face_image_path.not.is.null')

  if (expiredWithImages && expiredWithImages.length > 0) {
    for (const req of expiredWithImages) {
      await deleteKycImages(req.tenant_id, req.id)

      await supabase
        .from('kyc_requests')
        .update({
          id_front_image_path: null,
          id_back_image_path: null,
          id_thickness_image_path: null,
          face_image_path: null,
        })
        .eq('id', req.id)

      writeKycAuditLog({
        tenantId: req.tenant_id,
        kycRequestId: req.id,
        action: 'cleanup_images',
        details: { reason: '120日経過のため画像削除' },
      }).catch(() => {})
    }

    results.imagesDeleted = expiredWithImages.length
  }

  // 3. 3年以上 approved → 画像をストレージから削除（古物営業法の保存義務期間後）
  const threeYearsAgo = new Date(now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString()
  const { data: archivedRequests } = await supabase
    .from('kyc_requests')
    .select('id, tenant_id')
    .eq('status', 'approved')
    .lt('created_at', threeYearsAgo)
    .or('id_front_image_path.not.is.null,id_back_image_path.not.is.null,id_thickness_image_path.not.is.null,face_image_path.not.is.null')

  if (archivedRequests && archivedRequests.length > 0) {
    for (const req of archivedRequests) {
      await deleteKycImages(req.tenant_id, req.id)

      await supabase
        .from('kyc_requests')
        .update({
          id_front_image_path: null,
          id_back_image_path: null,
          id_thickness_image_path: null,
          face_image_path: null,
        })
        .eq('id', req.id)

      writeKycAuditLog({
        tenantId: req.tenant_id,
        kycRequestId: req.id,
        action: 'cleanup_images',
        details: { reason: '3年経過（古物営業法保存義務期間後）のため画像削除' },
      }).catch(() => {})
    }

    results.archivedDeleted = archivedRequests.length
  }

  console.log('[KYC Cleanup]', results)
  return NextResponse.json({ success: true, ...results })
}
