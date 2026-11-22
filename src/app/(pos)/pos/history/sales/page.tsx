import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { formatDateTimeJst, formatYen, todayJst } from '@/lib/pos-buyback'
import { shiftDate } from '@/lib/pos-sales'
import type { Sale } from '@/types/database'

export const dynamic = 'force-dynamic'

/** 取引履歴（販売）。既定は今日。行から詳細（レシートの再印刷・取消）へ */
export default async function PosSalesHistoryPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams
  const today = todayJst()
  const valid = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
  const from = valid(sp.from) ?? today
  const to = valid(sp.to) ?? today
  const tenantId = await requireTenantId()
  const supabase = await createClient()
  const { data } = await supabase
    .from('sales')
    .select('*, sale_items(quantity)')
    .eq('tenant_id', tenantId)
    .gte('created_at', `${from}T00:00:00+09:00`)
    .lte('created_at', `${to}T23:59:59.999+09:00`)
    .order('created_at', { ascending: false })
    .limit(300)
  const rows = (data ?? []) as (Sale & { sale_items: { quantity: number }[] })[]
  const live = rows.filter((r) => !r.voided_at)
  const total = live.reduce((s, r) => s + r.total, 0)
  const singleDay = from === to

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-lg font-bold">取引履歴（販売）</h1>
        <Link href="/pos/history" className="rounded-md border px-3 py-2 text-sm hover:bg-muted">
          買取の履歴へ
        </Link>
        <form className="flex items-end gap-2" action="/pos/history/sales">
          <Link href={`/pos/history/sales?from=${shiftDate(from, -1)}&to=${singleDay ? shiftDate(from, -1) : to}`} className="rounded-md border px-3 py-2 text-sm hover:bg-muted">
            前日
          </Link>
          <label className="text-sm">
            <span className="block text-muted-foreground">開始</span>
            <input type="date" name="from" defaultValue={from} className="mt-1 h-10 rounded-md border bg-background px-2" />
          </label>
          <label className="text-sm">
            <span className="block text-muted-foreground">終了</span>
            <input type="date" name="to" defaultValue={to} className="mt-1 h-10 rounded-md border bg-background px-2" />
          </label>
          <button type="submit" className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground">
            表示
          </button>
          <Link href="/pos/history/sales" className="rounded-md border px-3 py-2 text-sm hover:bg-muted">
            今日
          </Link>
        </form>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-normal">取引番号</th>
              <th className="px-3 py-2 text-left font-normal">日時</th>
              <th className="px-3 py-2 text-left font-normal">状態</th>
              <th className="px-3 py-2 text-right font-normal">点数</th>
              <th className="px-3 py-2 text-right font-normal">合計（税込）</th>
              <th className="px-3 py-2 text-left font-normal">担当</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  この期間の販売はありません
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="whitespace-nowrap px-3 py-2">
                    <Link href={`/pos/sell/${r.id}`} className="font-mono font-bold">
                      {r.sale_number}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDateTimeJst(r.created_at)}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {r.voided_at ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground" title={r.void_reason ?? ''}>取消</span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">販売済</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{r.sale_items.reduce((s, i) => s + i.quantity, 0)}</td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${r.voided_at ? 'text-muted-foreground line-through' : ''}`}>{formatYen(r.total)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{r.sold_by_name ?? ''}</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/pos/sell/${r.id}`} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
                      レシート・取消
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {live.length > 0 ? (
            <tfoot>
              <tr className="border-t bg-muted/30 font-medium">
                <td colSpan={4} className="px-3 py-2">
                  販売 {live.length} 件{rows.length > live.length ? `（ほかに取消 ${rows.length - live.length} 件）` : ''}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatYen(total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <p className="text-xs text-muted-foreground">最大 300 件まで表示します。</p>
    </div>
  )
}
