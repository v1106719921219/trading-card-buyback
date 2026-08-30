// ヤマト運輸の荷物お問い合わせページから追跡ステータスを取得する（サーバー専用）
// 公式APIではなく公開の問い合わせページを読み取る方式のため、
// 取得できなかった番号はnullにして呼び出し側で表示を省略する

import { normalizeTrackingNumber, type TrackingStatusEntry } from './yamato-status'

const TRACKING_URL = 'https://toi.kuronekoyamato.co.jp/cgi-bin/tneko'

/**
 * 追跡番号（最大何件でも可・内部で10件ずつ照会）のステータスを取得する
 * 戻り値のキーは正規化済み（数字のみ）の追跡番号
 */
export async function fetchYamatoStatuses(
  numbers: string[]
): Promise<Record<string, TrackingStatusEntry | null>> {
  const result: Record<string, TrackingStatusEntry | null> = {}
  const unique = [...new Set(numbers.map(normalizeTrackingNumber).filter((n) => n.length >= 10))]

  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10)
    const body = new URLSearchParams({ number00: '1' })
    chunk.forEach((n, idx) => body.set(`number${String(idx + 1).padStart(2, '0')}`, n))

    try {
      const res = await fetch(TRACKING_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
      if (!res.ok) {
        console.error('[ヤマト追跡] HTTPエラー:', res.status)
        continue
      }
      parseTrackingHtml(await res.text(), result)
    } catch (err) {
      console.error('[ヤマト追跡] 取得エラー:', err)
    }

    // 連続アクセスを避けるため次のバッチまで少し待つ
    if (i + 10 < unique.length) await new Promise((r) => setTimeout(r, 1500))
  }

  for (const n of unique) {
    if (!(n in result)) result[n] = null
  }
  return result
}

// 応答HTMLから「N件目：1234-5678-9012」ごとのブロックを切り出してステータスを読む
function parseTrackingHtml(html: string, out: Record<string, TrackingStatusEntry | null>) {
  const checkedAt = new Date().toISOString()
  const blocks = html.split(/class="tracking-invoice-block-title"[^>]*>/).slice(1)

  for (const block of blocks) {
    const titleEnd = block.indexOf('</h3>')
    if (titleEnd < 0) continue
    const number = normalizeTrackingNumber(block.slice(0, titleEnd).split(/[：:]/).pop() ?? '')
    if (number.length < 10) continue

    const status = block.match(/tracking-invoice-block-state-title[^>]*>([^<]+)</)?.[1]?.trim()
    if (!status) continue
    const summary = block.match(/tracking-invoice-block-state-summary[^>]*>([^<]+)</)?.[1]?.trim() ?? null

    // ブロック内の日時（例: 08月30日 12:34）のうち最後のものを最新の動きとして扱う
    const events = block.match(/\d{1,2}月\d{1,2}日(?:\s|&nbsp;|　)*\d{1,2}:\d{2}/g)
    const lastEvent = events?.length ? events[events.length - 1].replace(/&nbsp;|　/g, ' ') : null

    out[number] = { status, summary, last_event: lastEvent, checked_at: checkedAt }
  }
}
