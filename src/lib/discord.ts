/**
 * Discord Webhook 通知ライブラリ
 * 検品問題発生時にDiscordチャンネルへ自動通知し、スレッドを起動する
 */

interface InspectionIssuePayload {
  orderId: string
  orderNumber: string
  customerName: string
  notes: string
  totalAmount?: number
  officeKey?: string // '山口' | '東京' など
}

/**
 * 検品「問題あり」時にDiscordへ通知する
 * 環境変数 DISCORD_INSPECTION_WEBHOOK_URL が設定されている必要がある
 */
export async function notifyDiscordInspectionIssue(data: InspectionIssuePayload): Promise<void> {
  const webhookUrl = data.officeKey === '東京'
    ? process.env.DISCORD_INSPECTION_WEBHOOK_URL_TOKYO
    : process.env.DISCORD_INSPECTION_WEBHOOK_URL_YAMAGUCHI
  if (!webhookUrl) {
    console.warn(`[Discord] Webhook URL が設定されていません (事務所: ${data.officeKey ?? 'デフォルト'})`)
    return
  }

  const message = [
    `🔴 **検品問題発生**`,
    ``,
    `**注文番号**: ${data.orderNumber}`,
    `**顧客名**: ${data.customerName}`,
    data.notes ? `**メモ**: ${data.notes}` : '',
    data.totalAmount ? `**検品後合計**: ¥${data.totalAmount.toLocaleString()}` : '',
    ``,
    `📸 **写真をこのスレッドに送ってください**`,
    `💬 **減額 or 返品** をスレッド内で話し合ってください`,
  ].filter(Boolean).join('\n')

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: message,
        // スレッド名を指定（Webhookがフォーラムチャンネルの場合に有効）
        thread_name: `[問題あり] ${data.orderNumber} - ${data.customerName}`,
      }),
    })

    if (!res.ok) {
      console.error('[Discord] Webhook送信失敗:', res.status, await res.text())
    } else {
      console.log('[Discord] 検品問題通知を送信しました:', data.orderNumber)
    }
  } catch (err) {
    console.error('[Discord] Webhook送信エラー:', err)
  }
}
