// LINE送信用の定型文（クライアント・サーバー両方から参照）

// お客様向けのステータス表示（社内ステータス→お客様にわかる言葉）
export const CUSTOMER_STATUS_LABEL: Record<string, string> = {
  '承認待ち': '受付確認中',
  '申込': '受付完了（発送待ち）',
  '発送済': '発送済み（到着待ち）',
  '検品完了': '検品完了（お振込準備中）',
  '振込済': 'お振込み完了',
  '振込確認済': 'お取引完了',
  'キャンセル': 'キャンセル',
}

// 注文状況ページ（LINEアプリ内で開くと本人の全注文とステータスが見られる）
export function myOrdersLiffUrl(): string {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID
  return liffId ? `https://liff.line.me/${liffId}?view=orders` : ''
}

// 申込受付時のメッセージ（このリンク1つでいつでも最新の全ステータスが分かる）
export function orderReceivedMessage(orderNumber: string, amount: number): string {
  const url = myOrdersLiffUrl()
  return [
    '【買取スクエア】',
    'お申込みありがとうございます。',
    `注文番号: ${orderNumber}`,
    `申込金額: ${amount.toLocaleString()}円`,
    '',
    '👇こちらのリンクから、発送・検品・お振込みまでの進捗をいつでもご確認いただけます（このメッセージを保存しておくと便利です）',
    url,
  ].join('\n')
}

export function idReminderMessage(orderNumber: string): string {
  return [
    '【買取スクエア】',
    'お荷物を確認いたしましたが、本人確認書類の同封が確認できませんでした。',
    'お手数ですが、本人確認書類のお写真をこちらのトークにお送りください。',
    `（注文番号: ${orderNumber}）`,
  ].join('\n')
}
