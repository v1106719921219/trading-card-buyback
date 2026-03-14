/**
 * OCR処理（身分証からテキスト情報を抽出）
 *
 * TODO [Phase2] Google Cloud Vision API を統合
 * - 身分証画像から氏名・住所・生年月日を自動抽出
 * - 抽出結果を kyc_requests.ocr_result / ocr_extracted_* に保存
 */

export interface OcrResult {
  name: string | null
  address: string | null
  birthDate: string | null
  raw: Record<string, unknown>
}

/**
 * スタブ実装 — Phase 2 で Google Cloud Vision API に置き換え
 */
export async function runOcr(_imagePath: string): Promise<OcrResult> {
  // TODO [Phase2] Google Cloud Vision API 統合
  return {
    name: null,
    address: null,
    birthDate: null,
    raw: { stub: true, message: 'OCR is not implemented yet (Phase 2)' },
  }
}
