import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/actions/auth'
import { canSeePosFigures } from '@/lib/store-mode'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { loadPosOverview, loadStockSummary } from '@/lib/pos-overview'
import { formatDateTimeJst, formatYen, todayJst } from '@/lib/pos-buyback'
import { shiftDate, sumDailyRows } from '@/lib/pos-sales'
import type { RegisterSession } from '@/types/database'

export const dynamic = 'force-dynamic'

const RANGES = [
  { days: 7, label: '7 日' },
  { days: 30, label: '30 日' },
  { days: 90, label: '90 日' },
]

/**
 * 分析（docs/pos/design.md 4 章「売上分析」）。日ごとの買取額・販売額・粗利、売れ筋、在庫、レジ締めの差額。
 * グラフは使わず、表の中の横棒で大小を見せる（iPad で読みやすく、印刷もしやすい）。
 */
export default async function PosAnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  // 売上・粗利の数字は admin / manager だけ。スタッフは入口（レジ開局 or 待機）へ戻す
  const me = await getCurrentUser()
  if (!canSeePosFigures(me?.role)) redirect('/pos')
  const sp = await searchParams
  const days = RANGES.some((r) => String(r.days) === sp.days) ? Number(sp.days) : 30
  const to = todayJst()
  const from = shiftDate(to, -(days - 1))
  const tenantId = await requireTenantId()
  const supabase = await createClient()
  const [overview, stock, { data: closed }] = await Promise.all([
    loadPosOverview(from, to),
    loadStockSummary(),
    supabase
      .from('register_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .not('closed_at', 'is', null)
      .gte('closed_at', `${from}T00:00:00+09:00`)
      .order('closed_at', { ascending: false })
      .limit(100),
  ])
  if ('error' in overview) {
    return <p className="p-6 text-sm text-muted-foreground">集計を読み込めませんでした。再読み込みしてください。</p>
  }
  const totals = sumDailyRows(overview.rows)
  const rows = [...overview.rows].reverse()
  const max = Math.max(1, ...rows.map((r) => Math.max(r.buybackAmount, r.salesAmount)))
  const sessions = (closed ?? []) as RegisterSession[]
  const diffTotal = sessions.reduce((s, r) => s + (r.difference ?? 0), 0)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-lg font-bold">分析</h1>
        <span className="text-sm text-muted-foreground">
          {from} 〜 {to}
        </span>
        <div className="flex rounded-lg border p-0.5 text-sm">
          {RANGES.map((r) => (
            <Link key={r.days} href={`/pos/analytics?days=${r.days}`} className={`rounded-md px-3 py-1.5 ${days === r.days ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="買取（支払済）" value={formatYen(totals.buybackAmount)} sub={`${totals.buybackCount} 件`} />
        <Tile label="販売（税込）" value={formatYen(totals.salesAmount)} sub={`${totals.salesCount} 件${overview.voidedCount > 0 ? ` ・ 返品・取消 ${overview.voidedCount} 件 ${formatYen(overview.voidedAmount)}` : ''}`} />
        <Tile label="粗利（販売 − 仕入）" value={formatYen(totals.grossProfit)} sub={totals.salesAmount > 0 ? `粗利率 ${Math.round((totals.grossProfit / totals.salesAmount) * 100)}%（税込の販売額に対して）` : '販売なし'} />
        <Tile label="レジ締めの差額（合計）" value={`${diffTotal > 0 ? '+' : ''}${formatYen(diffTotal)}`} sub={`締め ${sessions.length} 回`} warn={diffTotal !== 0} />
      </section>
      {!overview.salesReady ? <p className="text-xs text-amber-700">販売のデータを読めませんでした（段階 2 の移行が未適用の可能性があります）。買取の数字だけを表示しています。</p> : null}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="overflow-x-auto rounded-2xl border bg-card">
          <h2 className="px-4 py-3 font-bold">日ごとの買取と販売</h2>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-normal">日付</th>
                <th className="px-3 py-2 text-right font-normal">買取</th>
                <th className="px-3 py-2 text-right font-normal">販売</th>
                <th className="px-3 py-2 text-right font-normal">粗利</th>
                <th className="w-[30%] px-3 py-2 text-left font-normal">
                  <span className="mr-3 inline-flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm bg-amber-500" />買取</span>
                  <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm bg-emerald-600" />販売</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const empty = r.buybackCount === 0 && r.salesCount === 0
                return (
                  <tr key={r.date} className={`border-t ${empty ? 'text-muted-foreground' : ''}`}>
                    <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{r.date.slice(5).replace('-', '/')}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{r.buybackCount > 0 ? `${formatYen(r.buybackAmount)}（${r.buybackCount}）` : '—'}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{r.salesCount > 0 ? `${formatYen(r.salesAmount)}（${r.salesCount}）` : '—'}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{r.salesCount > 0 ? formatYen(r.grossProfit) : '—'}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex flex-col gap-0.5">
                        <div className="h-1.5 rounded-sm bg-amber-500" style={{ width: `${(r.buybackAmount / max) * 100}%` }} />
                        <div className="h-1.5 rounded-sm bg-emerald-600" style={{ width: `${(r.salesAmount / max) * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        <div className="flex flex-col gap-4">
          <section className="rounded-2xl border bg-card">
            <h2 className="px-4 py-3 font-bold">売れ筋（販売額の多い順）</h2>
            {overview.top.length === 0 ? (
              <p className="border-t px-4 py-6 text-center text-sm text-muted-foreground">この期間の販売はありません</p>
            ) : (
              <ol className="divide-y border-t text-sm">
                {overview.top.map((t, i) => (
                  <li key={t.name} className="flex items-center gap-3 px-4 py-2">
                    <span className="w-5 text-right tabular-nums text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{t.name}</span>
                    <span className="whitespace-nowrap tabular-nums text-muted-foreground">{t.quantity} 点</span>
                    <span className="whitespace-nowrap font-medium tabular-nums">{formatYen(t.amount)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {!('error' in stock) && stock.ready ? (
            <section className="rounded-2xl border bg-card p-4 text-sm">
              <h2 className="mb-2 font-bold">いまの在庫</h2>
              <dl className="grid grid-cols-2 gap-y-1.5">
                <dt className="text-muted-foreground">店頭在庫</dt>
                <dd className="text-right tabular-nums">{stock.storeCount} 点</dd>
                <dt className="text-muted-foreground">仕入原価の合計</dt>
                <dd className="text-right tabular-nums">{formatYen(stock.storeCost)}</dd>
                <dt className="text-muted-foreground">売価の合計</dt>
                <dd className="text-right tabular-nums">{formatYen(stock.storeValue)}</dd>
                <dt className="text-muted-foreground">売価未設定</dt>
                <dd className="text-right tabular-nums">{stock.unpricedCount} 件</dd>
                <dt className="text-muted-foreground">入庫から 60 日以上</dt>
                <dd className="text-right tabular-nums">{stock.staleCount} 件</dd>
                <dt className="text-muted-foreground">振分待ち</dt>
                <dd className="text-right tabular-nums">{stock.pendingCount} 点</dd>
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">価格帯のカードは枚数だけを持つので、ここの点数・金額には含みません。</p>
            </section>
          ) : null}

          <section className="rounded-2xl border bg-card">
            <h2 className="px-4 py-3 font-bold">レジ締め</h2>
            {sessions.length === 0 ? (
              <p className="border-t px-4 py-6 text-center text-sm text-muted-foreground">この期間のレジ締めはありません</p>
            ) : (
              <ul className="divide-y border-t text-sm">
                {sessions.slice(0, 15).map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-2">
                    <span className="whitespace-nowrap tabular-nums">{s.closed_at ? formatDateTimeJst(s.closed_at) : ''}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{s.operator_name ?? ''}{s.notes ? ` ・ ${s.notes}` : ''}</span>
                    <span className={`whitespace-nowrap font-medium tabular-nums ${(s.difference ?? 0) !== 0 ? 'text-red-600' : ''}`}>
                      {(s.difference ?? 0) === 0 ? '差額なし' : `${(s.difference ?? 0) > 0 ? '+' : ''}${formatYen(s.difference ?? 0)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        粗利は「売れた物の販売額（税込）− その仕入単価」です。買い取ってまだ売れていない分は含みません。価格帯のカードは、帯の買取単価を仕入単価として計算します。
      </p>
    </div>
  )
}

function Tile({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-card p-4 ${warn ? 'border-amber-300' : ''}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub ? <div className="mt-1 truncate text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  )
}
