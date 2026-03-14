export async function appendOrderToSheet(order: {
  order_number: string
  customer_name: string
  customer_line_name: string | null
  customer_email: string
  customer_phone: string | null
  customer_birth_date: string
  customer_occupation: string
  customer_prefecture: string
  customer_address: string | null
  customer_not_invoice_issuer: boolean
  invoice_issuer_number: string | null
  customer_identity_method: string
  bank_name: string
  bank_branch: string
  bank_account_type: string
  bank_account_number: string
  bank_account_holder: string
  total_amount: number
  office_name: string
  shipped_date: string | null
  items: { product_name: string; unit_price: number; quantity: number }[]
}) {
  const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL
  if (!APPS_SCRIPT_URL) {
    console.warn('[Google Sheets] GOOGLE_APPS_SCRIPT_URL が未設定のためスキップ')
    return
  }

  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })

  const itemsText = order.items
    .map((i) => `${i.product_name} ×${i.quantity} @${i.unit_price}`)
    .join(' / ')

  const row = [
    now,
    order.order_number,
    order.customer_name,
    order.customer_line_name || '',
    order.customer_email,
    order.customer_phone || '',
    order.customer_birth_date,
    order.customer_occupation,
    order.customer_prefecture,
    order.customer_address || '',
    order.customer_not_invoice_issuer ? 'はい' : 'いいえ',
    order.invoice_issuer_number || '',
    order.customer_identity_method,
    order.bank_name,
    order.bank_branch,
    order.bank_account_type,
    order.bank_account_number,
    order.bank_account_holder,
    order.office_name,
    order.shipped_date || '',
    itemsText,
    order.total_amount,
  ]

  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ row }),
    redirect: 'follow',
  })

  const text = await res.text()
  if (text !== 'OK') {
    throw new Error(`Google Sheets backup failed: status=${res.status} body=${text.substring(0, 200)}`)
  }
}
