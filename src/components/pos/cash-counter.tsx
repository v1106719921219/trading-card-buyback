'use client'

import { BILL_DENOMINATIONS, COIN_DENOMINATIONS, ROLL_SIZE, cashCountTotal, piecesOf, type CashCount } from '@/lib/pos-register'
import { formatYen } from '@/lib/pos-buyback'

/**
 * 金種の入力（札は枚数、硬貨は棒金の本数とバラの枚数）。合計は自動で出す。
 * レジ締めと、営業中の釣銭の追加・売上金の回収で使う。
 */
export function CashCounter({ value, onChange, disabled }: { value: CashCount; onChange: (next: CashCount) => void; disabled?: boolean }) {
  function set(part: 'pieces' | 'rolls', denomination: number, raw: string) {
    const digits = raw.replace(/[^0-9]/g, '').slice(0, 6)
    const n = digits === '' ? 0 : Number(digits)
    const next: CashCount = { pieces: { ...value.pieces }, rolls: { ...value.rolls } }
    if (n > 0) next[part][String(denomination)] = n
    else delete next[part][String(denomination)]
    onChange(next)
  }

  const cell = (part: 'pieces' | 'rolls', denomination: number, label: string) => {
    const n = value[part][String(denomination)] ?? 0
    return (
      <label className="flex items-center gap-1">
        <input
          value={n > 0 ? String(n) : ''}
          onChange={(e) => set(part, denomination, e.target.value)}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="0"
          disabled={disabled}
          aria-label={`${denomination.toLocaleString('ja-JP')} 円 ${label}`}
          className="h-11 w-16 rounded-md border bg-background px-2 text-right text-base tabular-nums disabled:opacity-60"
        />
        <span className="text-xs text-muted-foreground">{label}</span>
      </label>
    )
  }

  const row = (denomination: number, coin: boolean) => (
    <div key={denomination} className="flex items-center gap-3 border-b py-1.5 last:border-b-0">
      <span className="w-20 shrink-0 text-right font-medium tabular-nums">{denomination.toLocaleString('ja-JP')} 円</span>
      <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        {coin ? cell('rolls', denomination, '本') : null}
        {cell('pieces', denomination, '枚')}
      </div>
      <span className="w-24 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{formatYen(denomination * piecesOf(value, denomination))}</span>
    </div>
  )

  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
        <div>
          <div className="mb-1 text-xs text-muted-foreground">札</div>
          {BILL_DENOMINATIONS.map((d) => row(d, false))}
        </div>
        <div>
          <div className="mb-1 text-xs text-muted-foreground">硬貨（棒金 1 本 = {ROLL_SIZE} 枚）</div>
          {COIN_DENOMINATIONS.map((d) => row(d, true))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t pt-2">
        <span className="text-sm text-muted-foreground">合計</span>
        <span className="text-xl font-bold tabular-nums">{formatYen(cashCountTotal(value))}</span>
      </div>
    </div>
  )
}
