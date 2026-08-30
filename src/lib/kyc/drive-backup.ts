// eKYCの本人確認データを古物台帳としてGoogleドライブへバックアップする
// 既存の注文台帳（スプレッドシート追記）と同じApps Script Webhook方式。
// Apps Script側は {type:'kyc', yearMonth, folderName, infoText, images[]} を受け取り
// マイドライブの「古物台帳_本人確認」フォルダ配下に保存して 'OK' を返す。

import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'kyc-documents'

export interface KycBackupTarget {
  id: string
  customer_name: string | null
  customer_email: string
  id_document_type: string
  id_front_image_path: string | null
  id_thickness_image_path: string | null
  id_back_image_path: string | null
  face_image_path: string | null
  ocr_extracted_name: string | null
  ocr_extracted_address: string | null
  ocr_extracted_birth_date: string | null
  reviewed_at: string | null
  created_at: string
  order_number?: string | null
}

const DOC_TYPE_LABEL: Record<string, string> = {
  driving_license: '運転免許証',
  my_number_card: 'マイナンバーカード',
  residence_card: '在留カード',
  passport: 'パスポート',
}

function jstDate(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
}

// フォルダ名に使えない文字を除去
function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '_').trim()
}

export async function backupKycToDrive(kyc: KycBackupTarget): Promise<{ success: boolean; error?: string }> {
  const url = process.env.GOOGLE_KYC_BACKUP_SCRIPT_URL
  if (!url) return { success: false, error: 'GOOGLE_KYC_BACKUP_SCRIPT_URL が未設定' }

  const supabase = createAdminClient()
  const imageDefs: Array<[string, string | null]> = [
    ['書類_表', kyc.id_front_image_path],
    ['書類_厚み', kyc.id_thickness_image_path],
    ['書類_裏', kyc.id_back_image_path],
    ['顔写真', kyc.face_image_path],
  ]

  const images: { name: string; mimeType: string; base64: string }[] = []
  for (const [label, path] of imageDefs) {
    if (!path) continue
    const { data, error } = await supabase.storage.from(BUCKET).download(path)
    if (error || !data) {
      console.error('[KYC Driveバックアップ] 画像取得失敗:', path, error)
      continue
    }
    const buf = Buffer.from(await data.arrayBuffer())
    const ext = path.split('.').pop() ?? 'jpg'
    images.push({ name: `${label}.${ext}`, mimeType: data.type || 'image/jpeg', base64: buf.toString('base64') })
  }

  if (images.length === 0) return { success: false, error: '保存対象の画像がありません' }

  const baseDate = kyc.reviewed_at ?? kyc.created_at
  const ymd = new Date(baseDate).toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }) // YYYY-MM-DD
  const yearMonth = ymd.slice(0, 7)
  const folderName = safeName(
    `${ymd}_${kyc.customer_name ?? '氏名不明'}${kyc.order_number ? `_${kyc.order_number}` : ''}`
  )

  const infoText = [
    '【本人確認記録（古物台帳）】',
    `氏名: ${kyc.customer_name ?? ''}`,
    `メールアドレス: ${kyc.customer_email}`,
    `本人確認書類: ${DOC_TYPE_LABEL[kyc.id_document_type] ?? kyc.id_document_type}`,
    `OCR読取氏名: ${kyc.ocr_extracted_name ?? ''}`,
    `OCR読取住所: ${kyc.ocr_extracted_address ?? ''}`,
    `OCR読取生年月日: ${kyc.ocr_extracted_birth_date ?? ''}`,
    `注文番号: ${kyc.order_number ?? '（申込前確認）'}`,
    `申請日時: ${jstDate(kyc.created_at)}`,
    `承認日時: ${kyc.reviewed_at ? jstDate(kyc.reviewed_at) : ''}`,
    `システムID: ${kyc.id}`,
  ].join('\n')

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'kyc', yearMonth, folderName, infoText, images }),
      redirect: 'follow',
    })
    const text = await res.text()
    // Apps Scriptの応答はGoogleのHTMLページに包まれて返ることがあるため、タグを除去して判定する
    const plain = text
      .replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (plain !== 'OK') {
      return { success: false, error: `Apps Script応答異常: status=${res.status} body=${plain.slice(0, 200)}` }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
