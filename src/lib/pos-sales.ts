/**
 * 店舗 POS の在庫・販売（段階 2）の純粋ロジック。docs/pos/design.md 3.2 節、6 章。
 * DB やネットワークに触れない（scripts/tests/pos-sales.cjs で検証する）。
 */

/** 消費税率（%）。トレカは標準税率のみ */
export const SALE_TAX_RATE = 10

/** 税込金額に含まれる消費税（内税）。1 円未満は切り捨て。DB の store_complete_sale と同じ式 */
export function includedTax(totalInclTax: number, ratePercent: number = SALE_TAX_RATE): number {
  if (!Number.isFinite(totalInclTax) || totalInclTax <= 0) return 0
  return Math.floor((totalInclTax * ratePercent) / (100 + ratePercent))
}

export interface CartLine {
  /** 個別の在庫なら inventory、価格帯なら band */
  kind: 'inventory' | 'band'
  id: string
  name: string
  /** 税込の単価 */
  unitPrice: number
  quantity: number
  /** 在庫数（個別の在庫だけ。これを超えては売れない） */
  available?: number
  detail?: string
}

export function cartKey(line: Pick<CartLine, 'kind' | 'id'>): string {
  return `${line.kind}:${line.id}`
}

export function cartTotals(lines: CartLine[]): { count: number; total: number; tax: number } {
  const count = lines.reduce((s, l) => s + l.quantity, 0)
  const total = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
  return { count, total, tax: includedTax(total) }
}

/** カートに 1 行足す。同じ在庫・価格帯は数量を足し、在庫数を超えたら止める */
export function addToCart(lines: CartLine[], line: CartLine): { lines: CartLine[] } | { error: string } {
  const key = cartKey(line)
  const existing = lines.find((l) => cartKey(l) === key)
  const nextQty = (existing?.quantity ?? 0) + line.quantity
  if (line.kind === 'inventory' && line.available !== undefined && nextQty > line.available) {
    return { error: `「${line.name}」の在庫は ${line.available} 点です` }
  }
  if (existing) return { lines: lines.map((l) => (cartKey(l) === key ? { ...l, quantity: nextQty, unitPrice: line.unitPrice, available: line.available } : l)) }
  return { lines: [...lines, line] }
}

/** 数量を変える。0 以下は行を消す */
export function setCartQuantity(lines: CartLine[], key: string, quantity: number): { lines: CartLine[] } | { error: string } {
  if (!Number.isInteger(quantity)) return { error: '数量は整数で入力してください' }
  if (quantity <= 0) return { lines: lines.filter((l) => cartKey(l) !== key) }
  const target = lines.find((l) => cartKey(l) === key)
  if (!target) return { lines }
  if (target.kind === 'inventory' && target.available !== undefined && quantity > target.available) {
    return { error: `「${target.name}」の在庫は ${target.available} 点です` }
  }
  if (quantity > 10000) return { error: '数量が多すぎます' }
  return { lines: lines.map((l) => (cartKey(l) === key ? { ...l, quantity } : l)) }
}

/** 預り金とおつり。足りないときは不足額を返す */
export function changeDue(total: number, tendered: number): { ok: true; change: number } | { ok: false; short: number } {
  if (!Number.isSafeInteger(tendered) || tendered < 0) return { ok: false, short: total }
  if (tendered < total) return { ok: false, short: total - tendered }
  return { ok: true, change: tendered - total }
}

/** 会計の RPC（store_complete_sale）に渡す形 */
export type SaleLinePayload =
  | { inventory_item_id: string; quantity: number; unit_price: number }
  | { price_band_id: string; quantity: number; unit_price: number }

export function toSaleLines(lines: CartLine[]): SaleLinePayload[] {
  return lines.map((l) =>
    l.kind === 'inventory'
      ? { inventory_item_id: l.id, quantity: l.quantity, unit_price: l.unitPrice }
      : { price_band_id: l.id, quantity: l.quantity, unit_price: l.unitPrice }
  )
}

/** 入力がラベルのバーコード（S + 8 桁）かどうか */
export function looksLikeBarcode(input: string): boolean {
  return /^S\d{8}$/i.test(input.normalize('NFKC').trim())
}

export const INVENTORY_STATUS_LABELS: Record<string, string> = {
  in_stock: '在庫あり',
  sold: '販売済み',
  written_off: '除却',
  transferred: '本部へ移動',
  banded: '価格帯へ',
}

export const INVENTORY_SOURCE_LABELS: Record<string, string> = {
  buyback: '買取',
  manual: '手入力',
  opened_box: '開封',
  transfer_in: '本部から',
}

/** 入庫からの日数（滞留の目安） */
export function daysSince(iso: string, at: Date = new Date()): number {
  return Math.max(0, Math.floor((at.getTime() - new Date(iso).getTime()) / 86_400_000))
}

/** 売価の検証（税込、0 円以上の整数。仕入単価を下回るときは注意を返す） */
export function validateSalePrice(price: number, cost: number): { ok: true; belowCost: boolean } | { ok: false; error: string } {
  if (!Number.isSafeInteger(price) || price < 0 || price > 100_000_000) return { ok: false, error: '売価は 0 円以上の整数で入力してください' }
  return { ok: true, belowCost: price < cost }
}

// ---------------------------------------------------------------------------
// 集計（本日の状況・分析）
// ---------------------------------------------------------------------------

export interface DailyTotalsInput {
  /** 買取の現金支払い（取消済みは除いて渡す） */
  buybacks: { paid_on: string; amount: number }[]
  /** 販売（取消済みは除いて渡す）。cost は明細の unit_cost × quantity の合計 */
  sales: { sold_on: string; total: number; cost: number }[]
}

export interface DailyRow {
  date: string
  buybackCount: number
  buybackAmount: number
  salesCount: number
  salesAmount: number
  /** 粗利 = 販売額（税込）− 仕入原価 */
  grossProfit: number
}

/** from〜to（YYYY-MM-DD、両端含む）の日ごとの集計。取引のない日も 0 で埋める */
export function buildDailyRows(from: string, to: string, input: DailyTotalsInput): DailyRow[] {
  const rows = new Map<string, DailyRow>()
  const start = new Date(`${from}T00:00:00Z`).getTime()
  const end = new Date(`${to}T00:00:00Z`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return []
  for (let t = start; t <= end && rows.size < 400; t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10)
    rows.set(date, { date, buybackCount: 0, buybackAmount: 0, salesCount: 0, salesAmount: 0, grossProfit: 0 })
  }
  for (const b of input.buybacks) {
    const r = rows.get(b.paid_on)
    if (!r) continue
    r.buybackCount += 1
    r.buybackAmount += b.amount
  }
  for (const s of input.sales) {
    const r = rows.get(s.sold_on)
    if (!r) continue
    r.salesCount += 1
    r.salesAmount += s.total
    r.grossProfit += s.total - s.cost
  }
  return [...rows.values()]
}

export function sumDailyRows(rows: DailyRow[]): Omit<DailyRow, 'date'> {
  return rows.reduce(
    (a, r) => ({
      buybackCount: a.buybackCount + r.buybackCount,
      buybackAmount: a.buybackAmount + r.buybackAmount,
      salesCount: a.salesCount + r.salesCount,
      salesAmount: a.salesAmount + r.salesAmount,
      grossProfit: a.grossProfit + r.grossProfit,
    }),
    { buybackCount: 0, buybackAmount: 0, salesCount: 0, salesAmount: 0, grossProfit: 0 }
  )
}

/** ISO 時刻を JST の日付（YYYY-MM-DD）にする */
export function jstDateOf(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** JST の日付を n 日ずらす */
export function shiftDate(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10)
}

export interface TopSellerInput {
  name: string
  quantity: number
  unit_price: number
  unit_cost: number
}

/** 売れ筋（同じ名前をまとめ、販売額の多い順） */
export function topSellers(items: TopSellerInput[], limit = 10): { name: string; quantity: number; amount: number; profit: number }[] {
  const map = new Map<string, { name: string; quantity: number; amount: number; profit: number }>()
  for (const i of items) {
    const cur = map.get(i.name) ?? { name: i.name, quantity: 0, amount: 0, profit: 0 }
    cur.quantity += i.quantity
    cur.amount += i.quantity * i.unit_price
    cur.profit += i.quantity * (i.unit_price - i.unit_cost)
    map.set(i.name, cur)
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount || b.quantity - a.quantity).slice(0, limit)
}
