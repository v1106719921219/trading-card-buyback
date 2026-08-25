// LINE送信用の定型文（クライアント・サーバー両方から参照）

export function idReminderMessage(orderNumber: string): string {
  return [
    '【買取スクエア】',
    'お荷物を確認いたしましたが、本人確認書類の同封が確認できませんでした。',
    'お手数ですが、本人確認書類のお写真をこちらのトークにお送りください。',
    `（注文番号: ${orderNumber}）`,
  ].join('\n')
}
