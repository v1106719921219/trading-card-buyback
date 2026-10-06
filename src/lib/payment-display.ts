type PaymentOrder = { status: string; total_amount: number; inspected_total_amount?: number | null; inspection_discount?: number | null; paid_amount?: number | null }
export function paymentTotal(order: PaymentOrder) {
  return (order.inspected_total_amount ?? order.total_amount) - (order.inspection_discount || 0)
}
export function paidAmount(order: PaymentOrder) {
  // 過去の全額支払いは支払履歴導入前の記録を維持する。
  return Number(order.paid_amount || (['振込済', '振込確認済'].includes(order.status) ? paymentTotal(order) : 0))
}
export function remainingPayment(order: PaymentOrder) {
  return Math.max(0, paymentTotal(order) - paidAmount(order))
}
export function paymentStatusLabel(order: { status: string; payment_method?: string | null; paid_amount?: number | null }) {
  if (!['振込済', '振込確認済', 'キャンセル'].includes(order.status) && Number(order.paid_amount) > 0) return '一部支払済'
  if (['振込済', '振込確認済'].includes(order.status)) {
    if (order.payment_method === 'cash') return order.status === '振込確認済' ? '現金支払済（会計確認済）' : '現金支払済'
    if (order.payment_method === 'mixed') return order.status === '振込確認済' ? '支払済（現金・振込／会計確認済）' : '支払済（現金・振込）'
  }
  return order.status
}
export function paymentMethodLabel(method: string | null | undefined) {
  return method === 'cash' ? '現金' : method === 'bank_transfer' ? '銀行振込' : method === 'mixed' ? '現金・銀行振込' : '未登録'
}
export function jstToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())
}
export function validPaymentDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= jstToday()
}
