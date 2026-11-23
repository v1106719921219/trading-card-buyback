import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/actions/auth'
import { canSeePosFigures } from '@/lib/store-mode'
import { ChevronRight } from 'lucide-react'
import { listOpenIntakes } from '@/actions/pos-buyback'
import { getRegisterSummary } from '@/actions/pos-checkout'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { loadPosOverview, loadStockSummary } from '@/lib/pos-overview'
import { POS_STATUS_LABELS, formatDateTimeJst, formatIntakeDateTime, formatYen, intakeNumberFromOrderNumber, todayJst } from '@/lib/pos-buyback'
import { sumDailyRows } from '@/lib/pos-sales'
import { formatBillCount, spotHourLabel } from '@/lib/pos-register'
import type { OrderStatus, RegisterSession, RegisterSpotCount } from '@/types/database'

export const dynamic = 'force-dynamic'

/**
 * 本日の状況（docs/pos/design.md 4 章 #2b）。スタッフ向けに、今日の買取・販売・レジの現金と進行中の受付を出す。
 * 客に見える待機画面には金額を出さないので、数字はここで見る。
 */
export default async function PosStatusPage() {
  // 売上・粗利の数字は admin / manager だけ。スタッフは入口（レジ開局 or 待機）へ戻す
  const me = await getCurrentUser()
  if (!canSeePosFigures(me?.role)) redirect('/pos')
  const today = todayJst()
  const tenantId = await requireTenantId()
  const supabase = await createClient()
  const [overview, stock, open, { data: sessionRow }] = await Promise.all([
    loadPosOverview(today, today),
    loadStockSummary(),
    listOpenIntakes(),
    supabase.from('register_sessions').select('*').eq('tenant_id', tenantId).is('closed_at', null).order('opened_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  const session = (sessionRow as RegisterSession | null) ?? null
  const [register, spotRes] = session
    ? await Promise.all([
        getRegisterSummary(session.id),
        supabase.from('register_spot_counts').select('*').eq('tenant_id', tenantId).eq('register_session_id', session.id).order('created_at', { ascending: true }),
      ])
    : [null, null]
  const spotCounts = (spotRes?.data ?? []) as RegisterSpotCount[]
  const totals = 'error' in overview ? null : sumDailyRows(overview.rows)
  const intakes = open.intakes ?? []

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4">
      <div className="flex items-end gap-3">
        <h1 className="mr-auto text-lg font-bold">本日の状況</h1>
        <span className="text-sm text-muted-foreground">{today}</span>
      </div>

      {totals ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="買取（支払済）" value={formatYen(totals.buybackAmount)} sub={`${totals.buybackCount} 件`} href="/pos/history" />
          <Tile label="販売（税込）" value={formatYen(totals.salesAmount)} sub={`${totals.salesCount} 件${'error' in overview || overview.voidedCount === 0 ? '' : ` ・ 返品・取消 ${overview.voidedCount} 件`}`} href="/pos/history/sales" />
          <Tile label="粗利（販売 − 仕入）" value={formatYen(totals.grossProfit)} sub="今日売れた分" href="/pos/analytics" />
          {session ? (
            <Tile
              label="レジの現金（理論残高）"
              value={register && !register.error ? formatYen(register.expected ?? 0) : '—'}
              sub={`担当 ${session.operator_name ?? '未選択'} ・ ${formatDateTimeJst(session.opened_at)} 開局`}
              href="/pos/register"
              strong
            />
          ) : (
            <Tile label="レジ" value="未開局" sub="開局すると現金残高が出ます" href="/pos/register" warn />
          )}
        </section>
      ) : (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">集計を読み込めませんでした。再読み込みしてください。</p>
      )}

      {!('error' in stock) && stock.ready ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="振分待ち" value={`${stock.pendingCount} 点`} sub="店頭販売・価格帯・本部へ振り分け" href="/pos/stock?tab=pending" warn={stock.pendingCount > 0} />
          <Tile label="店頭在庫" value={`${stock.storeCount} 点`} sub={`売価合計 ${formatYen(stock.storeValue)}`} href="/pos/stock?tab=store" />
          <Tile label="売価未設定" value={`${stock.unpricedCount} 件`} sub="売価を付けるまで販売できません" href="/pos/stock?tab=store" warn={stock.unpricedCount > 0} />
          <Tile label="在庫の仕入原価" value={formatYen(stock.storeCost)} sub={stock.staleCount > 0 ? `60 日以上 ${stock.staleCount} 件` : '店頭在庫の合計'} href="/pos/analytics" />
        </section>
      ) : null}

      {session ? (
        <section className="rounded-2xl border bg-card">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="font-bold">途中点検（札） {spotCounts.length > 0 ? `${spotCounts.length} 回` : ''}</h2>
            <Link href="/pos/register" className="text-sm underline underline-offset-4">
              レジへ
            </Link>
          </div>
          {spotCounts.length === 0 ? (
            <p className="border-t px-4 py-4 text-center text-sm text-muted-foreground">今日の点検はまだありません</p>
          ) : (
            <ul className="divide-y border-t text-sm">
              {spotCounts.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-4 px-4 py-2">
                  <span className="w-12 font-medium">{spotHourLabel(c.slot_hour)}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTimeJst(c.created_at)} 記録{c.counted_by_name ? ` ・ ${c.counted_by_name}` : ''}</span>
                  <span className="flex-1 text-xs text-muted-foreground">{[formatBillCount(c.bills), c.note ?? ''].filter(Boolean).join(' ／ ')}</span>
                  <span className="whitespace-nowrap tabular-nums">札 {formatYen(c.amount)}</span>
                  <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{c.expected_cash != null ? `理論残高 ${formatYen(c.expected_cash)}（硬貨込み）` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="rounded-2xl border bg-card">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="font-bold">進行中の受付 {intakes.length > 0 ? `${intakes.length} 件` : ''}</h2>
          <Link href="/pos/buy" className="text-sm underline underline-offset-4">
            買取へ
          </Link>
        </div>
        {intakes.length === 0 ? (
          <p className="border-t px-4 py-8 text-center text-sm text-muted-foreground">進行中の受付はありません</p>
        ) : (
          <ul className="divide-y border-t">
            {intakes.map((o) => (
              <li key={o.id}>
                <Link href={`/pos/buy/${o.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40">
                  <span className="font-mono text-xl font-bold">{intakeNumberFromOrderNumber(o.order_number)}</span>
                  <span className="min-w-0 flex-1 truncate">{o.customer_name || 'お名前未入力'}</span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{POS_STATUS_LABELS[o.status as OrderStatus] ?? o.status}</span>
                  <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">{formatIntakeDateTime(o.created_at)} 受付</span>
                  <span className="whitespace-nowrap text-sm tabular-nums">{o.item_count > 0 ? `${o.item_count} 点 ${formatYen(o.total_amount)}` : o.intake_count ? `約 ${o.intake_count} 点` : '査定前'}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Tile({ label, value, sub, href, strong, warn }: { label: string; value: string; sub?: string; href: string; strong?: boolean; warn?: boolean }) {
  return (
    <Link href={href} className={`rounded-2xl border bg-card p-4 hover:bg-muted/40 ${strong ? 'border-primary/50' : ''} ${warn ? 'border-amber-300' : ''}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${warn ? 'text-amber-700' : ''}`}>{value}</div>
      {sub ? <div className="mt-1 truncate text-xs text-muted-foreground">{sub}</div> : null}
    </Link>
  )
}
