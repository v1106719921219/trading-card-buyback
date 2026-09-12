import 'server-only'
import { signPayload, readPayload } from '@/lib/signed-payload'
import type { OrderItemInput } from '@/lib/validators/order'

type Quote = { tenantId: string; priceDate: string | null; products: { id: string; name: string; price: number }[] }
export function createOrderQuote(tenantId: string, products: Quote['products'], priceDate: string | null) {
  return signPayload('order-quote', { tenantId, products: products.map(p => ({ id: p.id, name: p.name, price: p.price })), priceDate }, 4 * 3600)
}
export function verifyOrderQuote(tenantId: string, token: string, items: OrderItemInput[]) {
  const quote = readPayload<Quote>(token, 'order-quote')
  if (!quote || quote.tenantId !== tenantId || !Array.isArray(quote.products)) throw new Error('価格情報の有効期限が切れました。申込画面を開き直してください')
  const products = new Map(quote.products.map(p => [p.id, p]))
  const quantities = new Map<string, number>()
  const verified = items.map(item => {
    const product = products.get(item.product_id)
    if (!product || product.price !== item.unit_price || !Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new Error('商品価格が一致しません。申込画面を開き直してください')
    const total = (quantities.get(item.product_id) ?? 0) + item.quantity
    if (total > 9999) throw new Error('商品の数量が上限を超えています')
    quantities.set(item.product_id, total)
    return { ...item, product_name: product.name, unit_price: product.price }
  })
  return { items: verified, priceDate: quote.priceDate }
}
