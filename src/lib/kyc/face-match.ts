/**
 * 顔認証処理（身分証の顔写真と自撮り画像を照合）
 *
 * TODO [Phase2] AWS Rekognition を統合
 * - CompareFaces API で類似度スコアを取得
 * - しきい値（80%以上等）で合否判定
 */

export interface FaceMatchResult {
  score: number | null
  passed: boolean | null
}

/**
 * スタブ実装 — Phase 2 で AWS Rekognition に置き換え
 */
export async function runFaceMatch(
  _idImagePath: string,
  _faceImagePath: string
): Promise<FaceMatchResult> {
  // TODO [Phase2] AWS Rekognition 統合
  return {
    score: null,
    passed: null,
  }
}
