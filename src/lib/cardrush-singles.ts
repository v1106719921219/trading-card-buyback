import { z } from 'zod'
import { isBulkSingle } from './single-product-groups'
import { singleSeriesCode } from './single-series'

export const singleSubcategories = ['19b8ce8e-1380-42ea-ba7a-0e2a0ad8a0b9', 'ca8f802a-52f1-495a-ab49-158063b00d64']
export type SingleProduct = { id: string; name: string; set_number: string | null; model_number: string | null; subcategory_id: string | null; price: number; updated_at: string; is_active: boolean }
export const rushQuoteSchema = z.object({ id: z.union([z.string(), z.number()]), name: z.string(), pack_code: z.string().nullable(), model_number: z.string().nullable(), rarity: z.string(), amount: z.number().int().nonnegative(), updated_at: z.string(), extra_difference: z.string().nullable().optional(), is_unlimited: z.boolean().nullable().optional() })
export type RushQuote = z.infer<typeof rushQuoteSchema>
export type RushRow = { id: string; name: string; code: string; current: number; proposed: number | null; quote: number | null; sourceUpdated: string | null; sourceUrl: string; expected: string; reason: string }
export function isEligibleSingle(p: SingleProduct) { return p.is_active && singleSubcategories.includes(p.subcategory_id || '') && !isBulkSingle(p) && !/PSA|鑑定|未開封|ミラー|セット|1ED|プロモ|仕様/i.test(p.name) }
const norm = (s: string) => s.normalize('NFKC').replace(/\s|LV\.\d+|LV\.X|\(上\)|\(下\)/gi, '').toLowerCase()
export function sourceIsFresh(date: string, now = Date.now()) {
  const t = Date.parse(date), day = (v: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(v)
  return Number.isFinite(t) && t <= now && now - t < 86400000 && day(t) === day(now)
}
export function matchRush(p: SingleProduct, quotes: RushQuote[], percent: number, now = Date.now()): RushRow {
  const code = singleSeriesCode(p)
  const row: RushRow = { id: p.id, name: p.name, code, current: p.price, proposed: null, quote: null, sourceUpdated: null, sourceUrl: `https://cardrush.media/pokemon/buying_prices?pack_code=${encodeURIComponent(code)}`, expected: p.updated_at, reason: '' }
  if (!isEligibleSingle(p)) return { ...row, reason: 'まとめ商品・特殊仕様は手動確認' }
  let name = p.name.replace(/\s*\[[^\]]+\]\s*$/, '').replace(/\s*\(\d{3}\/103\)\s*$/, '')
  const rarity = name.match(/\s(SAR|CSR|CHR|AR|SR|UR|MUR|BWR|HR|SSR|RRR|RR|MA|P|U|C)(?:\s+SA)?$/)?.[1] || '-'
  name = name.replace(/\s(SAR|CSR|CHR|AR|SR|UR|MUR|BWR|HR|SSR|RRR|RR|MA|P|U|C)(?:\s+SA)?$/, '')
  const model = p.model_number?.trim().replace(/^[A-Za-z0-9-]+\s+(\d+\/\d+)$/, '$1') || p.name.match(/\((\d{3}\/103)\)/)?.[1]
  if (!model || code === 'OTHER') return { ...row, reason: 'シリーズ・型番の確認が必要' }
  const exact = quotes.filter(q => q.pack_code?.toUpperCase() === code && q.model_number === model && q.rarity === rarity && norm(q.name) === norm(name) && !q.extra_difference && !q.is_unlimited)
  // 30th has a normal 30th/reprint annotation; match the unique named card, never a parallel variant.
  const candidates = exact.length ? exact : code === 'M6A' ? quotes.filter(q => q.pack_code?.toUpperCase() === code && q.model_number === model && q.rarity === rarity && norm(q.name) === norm(name) && !q.is_unlimited) : []
  if (candidates.length !== 1) return { ...row, reason: '掲載なし・同一商品の特定不可' }
  const q = candidates[0]
  Object.assign(row, { quote: q.amount, sourceUpdated: q.updated_at, sourceUrl: `https://cardrush.media/pokemon/buying_prices?pack_code=${encodeURIComponent(q.pack_code || code)}&model_number=${encodeURIComponent(model)}` })
  if (!sourceIsFresh(q.updated_at, now)) return { ...row, reason: '本日更新ではないため保留' }
  if (q.amount <= 0) return { ...row, reason: '掲載額0円のため保留' }
  if (p.price <= 0) return { ...row, reason: '買取価格未設定（0円）のため保留' }
  const proposed = Math.floor(q.amount * percent / 100)
  if (proposed <= 0) return { ...row, reason: '計算結果0円のため保留' }
  return { ...row, proposed, reason: proposed === p.price ? '価格一致' : '更新可能' }
}
export async function fetchRushSeries(code: string): Promise<RushQuote[]> {
  if (!/^[A-Z0-9+-]{1,16}$/.test(code)) throw Error('シリーズコードを確認してください')
  let variant: string | undefined, pages = 1
  const all: RushQuote[] = []
  for (let page = 1; page <= pages; page++) {
    let found: { buyingPrices: RushQuote[]; lastPage: number } | undefined
    for (const c of variant ? [variant] : [...new Set([code, code.toLowerCase(), code.replace(/([A-Z])$/, x => x.toLowerCase())])]) {
      const res = await fetch(`https://cardrush.media/pokemon/buying_prices?pack_code=${encodeURIComponent(c)}&limit=100&page=${page}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
      if (!res.ok) throw Error(`掲載元から取得できません（HTTP ${res.status}）`)
      const text = await res.text(), m = text.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
      if (!m) throw Error('掲載元の形式を確認してください')
      const data = z.object({ buyingPrices: z.array(rushQuoteSchema), lastPage: z.number().int().min(0).max(20), query: z.object({ pack_code: z.string() }) }).parse(JSON.parse(m[1]).props.pageProps)
      if (data.query.pack_code !== c) throw Error('取得シリーズが一致しません')
      if (data.buyingPrices.length) { variant = c; found = data; break }
    }
    if (!found) break
    pages = found.lastPage
    all.push(...found.buyingPrices.filter(q => q.pack_code?.toUpperCase() === code))
  }
  return [...new Map(all.map(q => [String(q.id), q])).values()]
}
