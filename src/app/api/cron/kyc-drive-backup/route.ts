import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { backupKycToDrive, type KycBackupTarget } from '@/lib/kyc/drive-backup'

export const maxDuration = 300

// 承認済みeKYCの本人確認データ（画像＋記録テキスト）をGoogleドライブへ日次バックアップ（古物台帳）
export async function GET(request: Request) {
  // Vercel Cron認証
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data: targets, error } = await supabase
    .from('kyc_requests')
    .select(
      'id, customer_name, customer_email, id_document_type, id_front_image_path, id_thickness_image_path, id_back_image_path, face_image_path, ocr_extracted_name, ocr_extracted_address, ocr_extracted_birth_date, reviewed_at, created_at, order:orders!kyc_requests_order_id_fkey(order_number)'
    )
    .eq('status', 'approved')
    .is('drive_backed_up_at', null)
    .or('id_front_image_path.not.is.null,id_back_image_path.not.is.null,id_thickness_image_path.not.is.null,face_image_path.not.is.null')
    .order('created_at', { ascending: true })
    .limit(15)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results = { backedUp: 0, failed: 0, errors: [] as string[] }
  for (const t of targets ?? []) {
    const order = t.order as { order_number: string } | { order_number: string }[] | null
    const orderNumber = Array.isArray(order) ? order[0]?.order_number : order?.order_number
    const result = await backupKycToDrive({ ...t, order_number: orderNumber ?? null } as KycBackupTarget)
    if (result.success) {
      await supabase
        .from('kyc_requests')
        .update({ drive_backed_up_at: new Date().toISOString() })
        .eq('id', t.id)
      results.backedUp++
    } else {
      results.failed++
      results.errors.push(`${t.id}: ${result.error}`)
      console.error('[KYC Driveバックアップ] 失敗:', t.id, result.error)
    }
  }

  return NextResponse.json({ success: true, ...results })
}
