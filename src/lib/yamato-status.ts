// ヤマト追跡ステータスの共通ヘルパー（クライアント・サーバー両方から使う純粋関数のみ）

export interface TrackingStatusEntry {
  status: string // 例: 配達完了 / 輸送中 / 配達中 / 伝票番号未登録
  summary?: string | null
  last_event?: string | null // 例: 08月30日 12:34（ヤマト側の最新の動き）
  checked_at: string // 最後にチェックした日時（ISO）
}

export type TrackingStatuses = Record<string, TrackingStatusEntry>

// 追跡番号を数字のみに正規化（ハイフン・空白・全角数字に対応）
export function normalizeTrackingNumber(raw: string): string {
  return raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[^0-9]/g, '')
}

export function isDeliveredStatus(status: string): boolean {
  return status.includes('配達完了') || status.includes('お届け完了') || status.includes('受け取り完了')
}

// ステータスに応じたバッジ色（Tailwindクラス）
export function trackingBadgeClass(status: string): string {
  if (isDeliveredStatus(status)) return 'bg-green-100 text-green-800'
  if (status.includes('誤り') || status.includes('未登録')) return 'bg-gray-100 text-gray-600'
  if (
    status.includes('不在') ||
    status.includes('持戻') ||
    status.includes('保管') ||
    status.includes('調査') ||
    status.includes('返品')
  ) {
    return 'bg-yellow-100 text-yellow-800'
  }
  return 'bg-blue-100 text-blue-800' // 発送済み・輸送中・配達中など動いている状態
}
