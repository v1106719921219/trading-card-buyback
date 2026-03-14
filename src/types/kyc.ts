export type KycStatus = 'pending' | 'processing' | 'approved' | 'rejected' | 'expired'

export type KycMethod = 'image' | 'ic_chip'

export type IdDocumentType = 'driving_license' | 'my_number_card' | 'passport'

export interface KycRequest {
  id: string
  tenant_id: string
  customer_email: string
  customer_name: string | null
  order_id: string | null
  status: KycStatus
  kyc_method: KycMethod
  id_document_type: IdDocumentType
  id_front_image_path: string | null
  id_back_image_path: string | null
  face_image_path: string | null
  ocr_result: Record<string, unknown> | null
  ocr_extracted_name: string | null
  ocr_extracted_address: string | null
  ocr_extracted_birth_date: string | null
  face_match_score: number | null
  face_match_passed: boolean | null
  reviewed_by: string | null
  reviewed_at: string | null
  rejection_reason: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
  // joined
  reviewer?: { id: string; display_name: string } | null
}

export interface KycAuditLog {
  id: string
  tenant_id: string
  kyc_request_id: string
  actor_id: string | null
  action: string
  details: Record<string, unknown>
  ip_address: string | null
  user_agent: string | null
  created_at: string
  // joined
  actor?: { id: string; display_name: string } | null
}

// ラベル定数
export const KYC_STATUS_LABELS: Record<KycStatus, string> = {
  pending: '画像アップロード待ち',
  processing: '審査中',
  approved: '承認済み',
  rejected: '否認',
  expired: '期限切れ',
}

export const KYC_STATUS_COLORS: Record<KycStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  expired: 'bg-gray-100 text-gray-800',
}

export const ID_DOCUMENT_TYPE_LABELS: Record<IdDocumentType, string> = {
  driving_license: '運転免許証',
  my_number_card: 'マイナンバーカード',
  passport: 'パスポート',
}

export const KYC_METHOD_LABELS: Record<KycMethod, string> = {
  image: '画像撮影',
  ic_chip: 'ICチップ読取',
}

/** 裏面撮影が必要な身分証種類 */
export const REQUIRES_BACK_IMAGE: IdDocumentType[] = ['driving_license']
