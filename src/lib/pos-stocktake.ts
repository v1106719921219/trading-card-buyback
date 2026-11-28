/**
 * 店舗 POS の棚卸しの純粋ロジック。docs/pos/design.md 6.4 節。
 * DB やネットワークに触れない（scripts/tests/pos-stocktake.cjs で検証する）。
 */

export interface StocktakeLineView {
  id: string
  kind: 'item' | 'band'
  name: string
  detail: string | null
  barcode: string | null
  allocation: string | null
  unit_cost: number
  expected_quantity: number
  counted_quantity: number | null
  reason: string | null
}

export const STOCKTAKE_STATUS_LABELS: Record<'open' | 'confirmed' | 'cancelled', string> = {
  open: '進行中',
  confirmed: '確定',
  cancelled: '中止',
}

/** 行の置き場所の表示名 */
export function stocktakeGroupLabel(line: Pick<StocktakeLineView, 'kind' | 'allocation'>): string {
  if (line.kind === 'band') return '価格帯'
  return line.allocation === 'store' ? '店頭在庫' : '振分待ち'
}

/** 実数 − 理論値。未入力は null */
export function lineDiff(line: Pick<StocktakeLineView, 'expected_quantity' | 'counted_quantity'>): number | null {
  return line.counted_quantity === null ? null : line.counted_quantity - line.expected_quantity
}

/** 差があるのに理由が空の行（確定を止める） */
export function needsReason(line: Pick<StocktakeLineView, 'expected_quantity' | 'counted_quantity' | 'reason'>): boolean {
  const d = lineDiff(line)
  return d !== null && d !== 0 && !(line.reason ?? '').trim()
}

/**
 * 実数の入力欄の文字を数にする。空は null（未入力に戻す）、数でなければ NaN。
 * 全角数字も受ける。
 */
export function parseCount(input: string): number | null {
  const s = input.normalize('NFKC').trim()
  if (s === '') return null
  if (!/^\d{1,7}$/.test(s)) return NaN
  const n = Number(s)
  return n > 1_000_000 ? NaN : n
}

export interface StocktakeSummary {
  total: number
  counted: number
  uncounted: number
  /** 差のある行 */
  diffLines: number
  missingReason: number
  /** 不足（理論値より少ない）枚数の合計。正の数 */
  shortage: number
  /** 過剰（理論値より多い）枚数の合計 */
  overage: number
  /** 差の金額（仕入単価ベース）。マイナスは不足 */
  diffCost: number
}

export function summarizeStocktake(lines: StocktakeLineView[]): StocktakeSummary {
  const s: StocktakeSummary = { total: lines.length, counted: 0, uncounted: 0, diffLines: 0, missingReason: 0, shortage: 0, overage: 0, diffCost: 0 }
  for (const l of lines) {
    const d = lineDiff(l)
    if (d === null) {
      s.uncounted += 1
      continue
    }
    s.counted += 1
    if (d === 0) continue
    s.diffLines += 1
    if (needsReason(l)) s.missingReason += 1
    if (d < 0) s.shortage += -d
    else s.overage += d
    s.diffCost += d * l.unit_cost
  }
  return s
}

export type StocktakeFilter = 'all' | 'uncounted' | 'diff'

/** 絞り込み（未入力・差あり）と、名前・型番・バーコードの部分一致（空白区切りはすべて含む） */
export function filterStocktakeLines<T extends StocktakeLineView>(lines: T[], filter: StocktakeFilter, query: string): T[] {
  const terms = query.normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean)
  return lines.filter((l) => {
    if (filter === 'uncounted' && l.counted_quantity !== null) return false
    if (filter === 'diff' && !lineDiff(l)) return false
    if (terms.length === 0) return true
    const hay = `${l.name} ${l.detail ?? ''} ${l.barcode ?? ''}`.normalize('NFKC').toLowerCase()
    return terms.every((t) => hay.includes(t))
  })
}

/** ラベルのバーコードから行を探す */
export function findLineByBarcode<T extends StocktakeLineView>(lines: T[], barcode: string): T | undefined {
  const code = barcode.normalize('NFKC').trim().toUpperCase()
  return code ? lines.find((l) => l.barcode === code) : undefined
}

/** 確定の前に出す確認文 */
export function confirmMessage(s: StocktakeSummary): string {
  const parts = [`入力した ${s.counted} 行のうち、差のある ${s.diffLines} 行を在庫に反映します。`]
  if (s.shortage > 0 || s.overage > 0) parts.push(`不足 ${s.shortage} 枚、過剰 ${s.overage} 枚。`)
  if (s.uncounted > 0) parts.push(`未入力の ${s.uncounted} 行は変更しません。`)
  parts.push('確定すると元に戻せません。よろしいですか？')
  return parts.join('\n')
}
