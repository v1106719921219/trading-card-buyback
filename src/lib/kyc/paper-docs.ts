/** 紙で受領した本人確認書類の画像の面。サーバーアクションとUIで共有する（'use server' ファイルは定数を公開できない） */
export const PAPER_DOC_LABELS = ['front', 'back', 'other'] as const
export type PaperDocLabel = (typeof PAPER_DOC_LABELS)[number]

export const PAPER_DOC_LABEL_TEXT: Record<PaperDocLabel, string> = {
  front: '表面',
  back: '裏面',
  other: 'その他',
}
