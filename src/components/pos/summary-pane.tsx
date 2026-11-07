'use client'

import { X } from 'lucide-react'
import { formatYen, sumAppraisal } from '@/lib/pos-buyback'
import type { OrderItem } from '@/types/database'

/**
 * 査定明細（右側の固定パネル）。査定・提示の両方で使う。
 * onRemove を渡したときだけ削除ボタンを出す。
 */
export function SummaryPane({
  items,
  customerLabel,
  onRemove,
  onSelect,
  selectedId,
  busy,
}: {
  items: OrderItem[]
  customerLabel: string
  onRemove?: (itemId: string) => void
  onSelect?: (itemId: string) => void
  selectedId?: string | null
  busy?: boolean
}) {
  const { count, total } = sumAppraisal(items)
  return (
    <aside className="flex h-full flex-col rounded-2xl border bg-card">
      <div className="border-b px-4 py-3">
        <h2 className="font-bold">査定明細</h2>
        <p className="text-xs text-muted-foreground">{customerLabel}</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">まだ明細がありません</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-normal">商品</th>
                <th className="px-2 py-2 text-right font-normal">数</th>
                <th className="px-2 py-2 text-right font-normal">単価</th>
                <th className="px-3 py-2 text-right font-normal">金額</th>
                {onRemove ? <th className="w-8" /> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const deducted = i.list_price != null && i.unit_price < i.list_price
                return (
                  <tr
                    key={i.id}
                    onClick={onSelect ? () => onSelect(i.id) : undefined}
                    className={[
                      'border-t align-top',
                      onSelect ? 'cursor-pointer hover:bg-muted/50' : '',
                      selectedId === i.id ? 'bg-amber-50' : '',
                    ].join(' ')}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium leading-tight">{i.product_name}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1 text-xs text-muted-foreground">
                        {i.condition_rank ? <span className="rounded bg-muted px-1.5">{i.condition_rank}</span> : null}
                        {i.price_band_id ? <span className="rounded bg-muted px-1.5">まとめ</span> : null}
                        {deducted ? <span>価格表 {formatYen(i.list_price!)}</span> : null}
                        {i.deduction_reason ? <span>／ {i.deduction_reason}</span> : null}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{i.quantity}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatYen(i.unit_price)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatYen(i.unit_price * i.quantity)}</td>
                    {onRemove ? (
                      <td className="py-2 pr-2">
                        <button
                          type="button"
                          aria-label="削除"
                          disabled={busy}
                          onClick={(e) => {
                            e.stopPropagation()
                            onRemove(i.id)
                          }}
                          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex items-end justify-between border-t px-4 py-3">
        <span className="text-sm text-muted-foreground">合計 {count} 点</span>
        <span className="text-2xl font-bold tabular-nums">{formatYen(total)}</span>
      </div>
    </aside>
  )
}
