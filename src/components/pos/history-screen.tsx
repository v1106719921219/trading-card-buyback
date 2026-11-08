'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { POS_STATUS_LABELS, formatDateTimeJst, formatYen, intakeNumberFromOrderNumber, isOpenBuybackStatus, todayJst } from '@/lib/pos-buyback'
import type { OrderStatus } from '@/types/database'

export type HistoryFilter = 'all' | 'open' | 'paid' | 'cancelled'

export interface HistoryRow {
  id: string
  order_number: string
  status: string
  customer_name: string
  created_at: string
  updated_at: string
  item_count: number
  total: number
  inspected_by_name: string | null
  intake_count: number | null
  notes: string | null
}

const FILTERS: { value: HistoryFilter; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'open', label: '進行中' },
  { value: 'paid', label: '支払済' },
  { value: 'cancelled', label: '持ち帰り・取消' },
]

function shiftDay(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * 取引履歴（docs/pos/design.md 4 章 #12）。日付・状態・受付番号／氏名で絞り、行を押すと受付の詳細へ。
 * 支払済は詳細から明細書の再印刷・PDF、申込書 PDF を開ける。進行中は今の段階の画面に戻る。
 */
export function HistoryScreen({ rows, from, to, q, filter }: { rows: HistoryRow[]; from: string; to: string; q: string; filter: HistoryFilter }) {
  const router = useRouter()
  const [f, setF] = useState(from)
  const [t, setT] = useState(to)
  const [query, setQuery] = useState(q)

  function go(next: Partial<{ from: string; to: string; q: string; status: HistoryFilter }>) {
    const p = new URLSearchParams()
    p.set('from', next.from ?? f)
    p.set('to', next.to ?? t)
    const qq = next.q ?? query
    if (qq.trim()) p.set('q', qq.trim())
    const st = next.status ?? filter
    if (st !== 'all') p.set('status', st)
    router.push(`/pos/history?${p.toString()}`)
  }

  const today = todayJst()
  const paid = rows.filter((r) => r.status === '振込済' || r.status === '振込確認済')
  const paidTotal = paid.reduce((s, r) => s + r.total, 0)
  const openCount = rows.filter((r) => isOpenBuybackStatus(r.status)).length
  const cancelled = rows.filter((r) => r.status === 'キャンセル').length
  const singleDay = from === to

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-lg font-bold">取引履歴（買取）</h1>
        <div className="flex items-end gap-1">
          <Button type="button" variant="outline" size="sm" onClick={() => go({ from: shiftDay(from, -1), to: singleDay ? shiftDay(from, -1) : to })} className="h-10">
            前日
          </Button>
          <label className="text-sm">
            <span className="text-muted-foreground">開始</span>
            <Input type="date" value={f} onChange={(e) => setF(e.target.value)} className="mt-1 h-10" />
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground">終了</span>
            <Input type="date" value={t} onChange={(e) => setT(e.target.value)} className="mt-1 h-10" />
          </label>
          <Button type="button" variant="outline" size="sm" onClick={() => go({ from: today, to: today })} className="h-10">
            今日
          </Button>
        </div>
        <label className="text-sm">
          <span className="text-muted-foreground">受付番号・氏名</span>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go({})} placeholder="015 / 山本" className="mt-1 h-10 w-44" />
        </label>
        <Button type="button" onClick={() => go({})} className="h-10">
          <Search className="h-4 w-4" />
          表示
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((x) => (
          <button
            key={x.value}
            type="button"
            onClick={() => go({ status: x.value })}
            className={['rounded-full border px-3 py-1 text-sm', filter === x.value ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'].join(' ')}
          >
            {x.label}
          </button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">
          支払済 {paid.length} 件 {formatYen(paidTotal)} ・ 進行中 {openCount} ・ 持ち帰り {cancelled}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-normal">受付</th>
              <th className="px-3 py-2 text-left font-normal">受付日時</th>
              <th className="px-3 py-2 text-left font-normal">状態</th>
              <th className="px-3 py-2 text-left font-normal">お客様</th>
              <th className="px-3 py-2 text-right font-normal">点数</th>
              <th className="px-3 py-2 text-right font-normal">金額</th>
              <th className="px-3 py-2 text-left font-normal">担当</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  この条件の取引はありません
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="whitespace-nowrap px-3 py-2">
                    <Link href={`/pos/buy/${r.id}`} className="font-mono text-base font-bold">
                      {intakeNumberFromOrderNumber(r.order_number)}
                    </Link>
                    {!singleDay ? <div className="font-mono text-[10px] text-muted-foreground">{r.order_number}</div> : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDateTimeJst(r.created_at)}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2">{r.customer_name}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{r.item_count > 0 ? r.item_count : r.intake_count ? `約${r.intake_count}` : '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{r.item_count > 0 ? formatYen(r.total) : '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{r.inspected_by_name ?? ''}</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/pos/buy/${r.id}`} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
                      {isOpenBuybackStatus(r.status) ? '続きへ' : r.status === 'キャンセル' ? '内容' : '明細・再印刷'}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {paid.length > 0 ? (
            <tfoot>
              <tr className="border-t bg-muted/30 font-medium">
                <td colSpan={5} className="px-3 py-2">
                  支払済 {paid.length} 件
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatYen(paidTotal)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <p className="text-xs text-muted-foreground">最大 300 件まで表示します。支払済の取消・返品は段階 2 で足します。古物台帳は「台帳」から見てください。</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const label = POS_STATUS_LABELS[status as OrderStatus] ?? status
  const tone =
    status === '振込済' || status === '振込確認済' ? 'bg-emerald-100 text-emerald-800'
    : status === 'キャンセル' ? 'bg-muted text-muted-foreground'
    : status === '検品完了' ? 'bg-amber-100 text-amber-800'
    : 'bg-blue-100 text-blue-800'
  return <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>{label}</span>
}
