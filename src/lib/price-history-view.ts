export type PriceHistoryPoint = { product_id: string; old_price: number; new_price: number; changed_at: string }
export function jstDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
/** Latest change before the next JST midnight; before the first change use its old price. */
export function pricesAtJstDate(products: { id: string; price: number }[], history: PriceHistoryPoint[], date: string) {
  const end = Date.parse(`${date}T00:00:00+09:00`) + 86400000
  if (!Number.isFinite(end)) throw Error('日付を確認してください')
  const first = new Map<string, PriceHistoryPoint>(), latest = new Map<string, PriceHistoryPoint>()
  for (const h of history) {
    const time = Date.parse(h.changed_at)
    if (!Number.isFinite(time)) continue
    const f = first.get(h.product_id), l = latest.get(h.product_id)
    if (!f || time < Date.parse(f.changed_at)) first.set(h.product_id, h)
    if (time < end && (!l || time > Date.parse(l.changed_at))) latest.set(h.product_id, h)
  }
  return new Map(products.map(p => [p.id, latest.get(p.id)?.new_price ?? first.get(p.id)?.old_price ?? p.price]))
}
