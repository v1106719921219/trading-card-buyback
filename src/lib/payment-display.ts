export function paymentStatusLabel(order: { status: string; payment_method?: string | null }) {
  if (order.payment_method === 'cash') {
    if (order.status === '振込済') return '現金支払済'
    if (order.status === '振込確認済') return '現金支払済（会計確認済）'
  }
  return order.status
}

export function jstToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())
}

export function validPaymentDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= jstToday()
}
