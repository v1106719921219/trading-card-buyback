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

export function isCashPaymentOrder(order: { planned_payment_method?: string | null; payment_method?: string | null }) {
  return order.planned_payment_method === 'cash' || order.payment_method === 'cash' || order.payment_method === 'mixed'
}
export function isBankTransferOrder(order: { planned_payment_method?: string | null; payment_method?: string | null }) {
  return !isCashPaymentOrder(order)
}

export function transferCsv(rows: { order_number: string; customer_name: string; bank_name: string | null; bank_branch: string | null; bank_account_type: string | null; bank_account_number: string | null; bank_account_holder: string | null; amount: number }[]) {
  const cell = (value: string | number | null) => {
    let text = String(value ?? '')
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text
    return '"' + text.replaceAll('"', '""') + '"'
  }
  return '\uFEFF' + [['注文番号','お客様名','銀行名','支店','口座種別','口座番号','名義','振込額'], ...rows.map(r => [r.order_number,r.customer_name,r.bank_name,r.bank_branch,r.bank_account_type,r.bank_account_number,r.bank_account_holder,r.amount])].map(row => row.map(cell).join(',')).join('\r\n')
}
