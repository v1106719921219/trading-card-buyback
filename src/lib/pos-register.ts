/**
 * レジの金種・締めの純粋な計算（docs/pos/design.md 3.3 節）。DB にもリクエストにも依存しない。
 *
 * 金種は { pieces: { 額面: バラの枚数 }, rolls: { 額面: 棒金の本数 } } で持つ。
 * 棒金は硬貨 50 枚を巻いたもの。合計 = Σ 額面 ×（バラ + 本数 × 50）。
 */

export const BILL_DENOMINATIONS = [10000, 5000, 2000, 1000] as const
export const COIN_DENOMINATIONS = [500, 100, 50, 10, 5, 1] as const
export const DENOMINATIONS: readonly number[] = [...BILL_DENOMINATIONS, ...COIN_DENOMINATIONS]

/** 棒金 1 本の枚数 */
export const ROLL_SIZE = 50

const MAX_PIECES = 100_000
const MAX_CASH = 100_000_000

export interface CashCount {
  pieces: Record<string, number>
  rolls: Record<string, number>
}

export const EMPTY_CASH_COUNT: CashCount = { pieces: {}, rolls: {} }

export function isCoin(denomination: number): boolean {
  return (COIN_DENOMINATIONS as readonly number[]).includes(denomination)
}

/** 額面ごとの枚数（バラ + 棒金） */
export function piecesOf(count: CashCount, denomination: number): number {
  const key = String(denomination)
  return (count.pieces[key] ?? 0) + (count.rolls[key] ?? 0) * ROLL_SIZE
}

export function cashCountTotal(count: CashCount): number {
  return DENOMINATIONS.reduce((sum, d) => sum + d * piecesOf(count, d), 0)
}

export function isEmptyCashCount(count: CashCount | null | undefined): boolean {
  if (!count) return true
  return DENOMINATIONS.every((d) => piecesOf(count, d) === 0)
}

/**
 * 画面や DB から来た金種を検証して整える。0 の項目は落とす。
 * 知らない額面、負の数、小数、札の棒金は受け付けない。
 */
export function normalizeCashCount(input: unknown): { ok: true; count: CashCount } | { ok: false; error: string } {
  if (input === null || input === undefined) return { ok: true, count: { pieces: {}, rolls: {} } }
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: '金種の入力が正しくありません' }
  const raw = input as { pieces?: unknown; rolls?: unknown }
  const out: CashCount = { pieces: {}, rolls: {} }
  for (const part of ['pieces', 'rolls'] as const) {
    const src = raw[part]
    if (src === undefined || src === null) continue
    if (typeof src !== 'object' || Array.isArray(src)) return { ok: false, error: '金種の入力が正しくありません' }
    for (const [key, value] of Object.entries(src as Record<string, unknown>)) {
      const denomination = Number(key)
      if (!DENOMINATIONS.includes(denomination)) return { ok: false, error: `${key} 円という金種はありません` }
      if (part === 'rolls' && !isCoin(denomination)) return { ok: false, error: '棒金は硬貨だけです' }
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > MAX_PIECES) {
        return { ok: false, error: `${denomination.toLocaleString('ja-JP')} 円の枚数を 0 以上の整数で入力してください` }
      }
      if (value > 0) out[part][String(denomination)] = value
    }
  }
  if (cashCountTotal(out) > MAX_CASH) return { ok: false, error: '金額が大きすぎます' }
  return { ok: true, count: out }
}

/** 表示用: 枚数がある金種だけを額面の大きい順に並べる */
export function describeCashCount(count: CashCount | null | undefined): { denomination: number; pieces: number; rolls: number; amount: number }[] {
  if (!count) return []
  return DENOMINATIONS.map((d) => ({
    denomination: d,
    pieces: count.pieces[String(d)] ?? 0,
    rolls: count.rolls[String(d)] ?? 0,
    amount: d * piecesOf(count, d),
  })).filter((r) => r.amount > 0)
}

/** 「1万×3 500×12（棒金1本）」のような 1 行の表記 */
export function formatCashCount(count: CashCount | null | undefined): string {
  return describeCashCount(count)
    .map((r) => {
      const label = r.denomination >= 10000 ? `${r.denomination / 10000}万` : r.denomination >= 1000 ? `${r.denomination / 1000}千` : String(r.denomination)
      const total = r.pieces + r.rolls * ROLL_SIZE
      return r.rolls > 0 ? `${label}×${total}（棒金${r.rolls}本）` : `${label}×${total}`
    })
    .join(' ')
}

/**
 * 締めの内訳。数えた現金を「翌日に残す額」と「回収する額」に分ける。
 * 残す額は 0 以上で、数えた現金を超えられない。
 */
export function planClose(countedCash: number, carryOver: number): { ok: true; withdrawn: number; carryOver: number } | { ok: false; error: string } {
  if (!Number.isSafeInteger(countedCash) || countedCash < 0 || countedCash > MAX_CASH) return { ok: false, error: '実際の現金を 0 円以上で入力してください' }
  if (!Number.isSafeInteger(carryOver) || carryOver < 0) return { ok: false, error: '翌日に残す金額を 0 円以上で入力してください' }
  if (carryOver > countedCash) return { ok: false, error: '翌日に残す金額が、数えた現金より多くなっています' }
  return { ok: true, withdrawn: countedCash - carryOver, carryOver }
}

/** 開局のときに入れておく釣銭準備金。前回の締めで残した額。古い締め（内訳なし）は数えた現金 */
export function suggestedOpeningFloat(last: { carry_over_float?: number | null; counted_cash?: number | null } | null | undefined): number | null {
  if (!last) return null
  if (typeof last.carry_over_float === 'number') return last.carry_over_float
  if (typeof last.counted_cash === 'number') return last.counted_cash
  return null
}

export type CashMovementCategory = 'change' | 'other_in' | 'expense' | 'pickup' | 'other_out'

export const CASH_MOVEMENT_CATEGORIES: { value: CashMovementCategory; kind: 'in' | 'out'; label: string; hint: string }[] = [
  { value: 'change', kind: 'in', label: '釣銭の追加', hint: '金庫から棒金・札をレジに足した' },
  { value: 'other_in', kind: 'in', label: 'その他の入金', hint: '' },
  { value: 'pickup', kind: 'out', label: '売上金の回収', hint: '営業中にレジから金庫へ移した' },
  { value: 'expense', kind: 'out', label: '経費', hint: '消耗品など' },
  { value: 'other_out', kind: 'out', label: 'その他の出金', hint: '' },
]

export function cashMovementCategory(value: unknown): (typeof CASH_MOVEMENT_CATEGORIES)[number] | null {
  return CASH_MOVEMENT_CATEGORIES.find((c) => c.value === value) ?? null
}

/** 入出金の一覧に出す種類の名前。種類のない古い記録は 入金 / 出金 */
export function cashMovementLabel(m: { kind: 'in' | 'out'; category?: string | null }): string {
  return cashMovementCategory(m.category)?.label ?? (m.kind === 'in' ? '入金' : '出金')
}
