/** 紙で受領した本人確認書類の画像の面。サーバーアクションとUIで共有する（'use server' ファイルは定数を公開できない） */
export const PAPER_DOC_LABELS = ['front', 'back', 'other'] as const
export type PaperDocLabel = (typeof PAPER_DOC_LABELS)[number]

export const PAPER_DOC_LABEL_TEXT: Record<PaperDocLabel, string> = {
  front: '表面',
  back: '裏面',
  other: 'その他',
}

/** 紙で受領した書類の種類（order_paper_kyc.document_type）。住民票以外はコピーの画像保存が承認の条件 */
export const PAPER_DOCUMENT_TYPES = [
  'residence_certificate',
  'driving_license',
  'my_number_card',
  'passport',
  'health_insurance',
  'residence_card',
] as const
export type PaperDocumentType = (typeof PAPER_DOCUMENT_TYPES)[number]

export const PAPER_DOCUMENT_TYPE_TEXT: Record<PaperDocumentType, string> = {
  residence_certificate: '住民票の写し（原本）',
  driving_license: '運転免許証のコピー',
  my_number_card: 'マイナンバーカードのコピー（表面のみ）',
  passport: 'パスポートのコピー',
  health_insurance: '保険証のコピー',
  residence_card: '在留カードのコピー',
}

/** 注文の本人確認方法の表示（DB側 paper_kyc_document_label と同じ短い呼び方） */
export const PAPER_DOCUMENT_SHORT_TEXT: Record<PaperDocumentType, string> = {
  residence_certificate: '住民票',
  driving_license: '運転免許証コピー',
  my_number_card: 'マイナンバーカードコピー',
  passport: 'パスポートコピー',
  health_insurance: '保険証コピー',
  residence_card: '在留カードコピー',
}

export function isPaperCopy(type: PaperDocumentType) {
  return type !== 'residence_certificate'
}
