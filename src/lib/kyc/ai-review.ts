import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'kyc-documents'

export interface AiKycReview {
  verdict: 'pass' | 'needs_review'
  extracted_name: string | null
  extracted_address: string | null
  extracted_birth_date: string | null
  name_match: boolean
  face_match: boolean
  document_looks_genuine: boolean
  concerns: string[]
  summary: string
}

/**
 * アップロードされた本人確認書類をAIで自動チェックする
 * 問題なし → 'pass'（自動承認に使う）、疑義あり → 'needs_review'（人間が確認）
 * APIキー未設定・画像なし・AIエラー時は null（人間確認にフォールバック）
 */
export async function runAiKycReview(input: {
  expectedName: string | null
  documentTypeLabel: string
  imagePaths: { label: string; path: string }[]
}): Promise<AiKycReview | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const supabase = createAdminClient()
  const content: Anthropic.ContentBlockParam[] = []

  for (const img of input.imagePaths) {
    if (!img.path) continue
    const { data, error } = await supabase.storage.from(BUCKET).download(img.path)
    if (error || !data) continue
    const mediaType = img.path.endsWith('.png')
      ? 'image/png'
      : img.path.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg'
    content.push({ type: 'text', text: `【${img.label}】` })
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: Buffer.from(await data.arrayBuffer()).toString('base64'),
      },
    })
  }

  if (content.filter((c) => c.type === 'image').length === 0) return null

  content.push({
    type: 'text',
    text: `あなたはトレーディングカード買取店の本人確認（古物営業法に基づくeKYC）の審査担当です。
上の画像を確認し、以下を判定してください。

## 申込情報
- 申込者氏名: ${input.expectedName ?? '不明'}
- 申告された身分証の種類: ${input.documentTypeLabel}

## 判定項目
1. 身分証から氏名・生年月日を読み取る（読み取れない場合はnull）。※住所は確認不要
2. 【最重要】身分証の氏名が申込者氏名と一致するか、を厳格に確認する。
   - 姓と名の両方が一致していること。一文字でも異なる、姓名の一部だけ一致、別人と疑われる場合は不一致とする
   - 空白・全角半角の違いは無視してよい
   - 漢字とローマ字/カナ表記が同一人物として妥当に対応する場合は一致とみなす（例: 山田太郎 と YAMADA TARO）
   - 少しでも氏名の判読が不鮮明で一致を確信できない場合も、一致とはせず needs_review とする
3. 顔写真（自撮り）と身分証の顔写真が同一人物に見えるか（顔写真がない身分証の場合はtrue）
4. 身分証の種類が申告と一致しているか・実物のカードを撮影したように見えるか（画面の再撮影・印刷物・加工の疑いがないか。厚み画像がある場合はカードの立体感も確認）

## 判定基準
- すべて問題なければ verdict は "pass"
- 1つでも疑義・不鮮明・不一致があれば verdict は "needs_review" とし、concerns に日本語で具体的に列挙
- 特に氏名が一致しない・確信できない場合は必ず "needs_review" とし、concerns に読み取った氏名と申込者氏名を明記する

## 出力形式
以下のJSONのみを出力してください。説明文は不要です。
{
  "verdict": "pass" | "needs_review",
  "extracted_name": string | null,
  "extracted_address": null,
  "extracted_birth_date": string | null,
  "name_match": boolean,
  "face_match": boolean,
  "document_looks_genuine": boolean,
  "concerns": string[],
  "summary": "1〜2文の日本語の判定理由"
}`,
  })

  const client = new Anthropic({ apiKey })

  try {
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content }],
    })

    if (response.stop_reason === 'refusal') {
      console.error('[KYC AI] モデルが審査を拒否しました')
      return null
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
    const jsonText = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const match = jsonText.match(/\{[\s\S]*\}/)
    if (!match) return null

    const parsed = JSON.parse(match[0]) as AiKycReview
    if (parsed.verdict !== 'pass' && parsed.verdict !== 'needs_review') return null
    return {
      verdict: parsed.verdict,
      extracted_name: parsed.extracted_name ?? null,
      extracted_address: parsed.extracted_address ?? null,
      extracted_birth_date: parsed.extracted_birth_date ?? null,
      name_match: !!parsed.name_match,
      face_match: !!parsed.face_match,
      document_looks_genuine: !!parsed.document_looks_genuine,
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
      summary: parsed.summary ?? '',
    }
  } catch (err) {
    console.error('[KYC AI] レビュー実行エラー:', err)
    return null
  }
}
