import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePosUser } from '@/lib/pos-auth'
import { buildDailyRows, jstDateOf, topSellers, type DailyRow } from '@/lib/pos-sales'

/**
 * 「本日の状況」「分析」用の集計。買取の支払い（order_payments）はスタッフの RLS では読めないので、
 * POS の利用者であることを確かめたうえで管理クライアントで tenant_id を明示して読む。
 * 段階 2 の移行（sales など）が未適用の DB でも、買取の数字だけは出るようにする。
 */
export interface PosOverview {
  rows: DailyRow[]
  /** 売れ筋（期間内、取消を除く） */
  top: { name: string; quantity: number; amount: number; profit: number }[]
  /** 期間内の取消（販売） */
  voidedCount: number
  voidedAmount: number
  /** 販売のテーブルが読めたか（移行前は false） */
  salesReady: boolean
}

export async function loadPosOverview(from: string, to: string): Promise<PosOverview | { error: string }> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error: error ?? '認証が必要です' }
  const admin = createAdminClient()
  const start = `${from}T00:00:00+09:00`
  const end = `${to}T23:59:59.999+09:00`
  const [payments, sales] = await Promise.all([
    admin
      .from('order_payments')
      .select('amount, created_at, orders!inner(channel)')
      .eq('tenant_id', user.tenant_id)
      .eq('method', 'cash')
      .is('voided_at', null)
      .eq('orders.channel', 'store')
      .gte('created_at', start)
      .lte('created_at', end)
      .limit(10000),
    admin
      .from('sales')
      .select('id, total, created_at, voided_at, sale_items(name, quantity, unit_price, unit_cost)')
      .eq('tenant_id', user.tenant_id)
      .gte('created_at', start)
      .lte('created_at', end)
      .limit(10000),
  ])
  type SaleRow = { id: string; total: number; created_at: string; voided_at: string | null; sale_items: { name: string; quantity: number; unit_price: number; unit_cost: number }[] }
  const saleRows = (sales.data ?? []) as SaleRow[]
  const live = saleRows.filter((s) => !s.voided_at)
  const voided = saleRows.filter((s) => s.voided_at)
  const rows = buildDailyRows(from, to, {
    buybacks: (payments.data ?? []).map((p) => ({ paid_on: jstDateOf(p.created_at), amount: Number(p.amount) })),
    sales: live.map((s) => ({
      sold_on: jstDateOf(s.created_at),
      total: s.total,
      cost: (s.sale_items ?? []).reduce((a, i) => a + i.quantity * i.unit_cost, 0),
    })),
  })
  return {
    rows,
    top: topSellers(live.flatMap((s) => s.sale_items ?? [])),
    voidedCount: voided.length,
    voidedAmount: voided.reduce((a, s) => a + s.total, 0),
    salesReady: !sales.error,
  }
}

export interface StockSummary {
  pendingCount: number
  storeCount: number
  /** 店頭在庫の仕入原価の合計と、売価の合計（売価未設定は除く） */
  storeCost: number
  storeValue: number
  unpricedCount: number
  /** 入庫から 60 日以上たった店頭在庫 */
  staleCount: number
  ready: boolean
}

export async function loadStockSummary(): Promise<StockSummary | { error: string }> {
  const { user, error } = await requirePosUser()
  if (error || !user) return { error: error ?? '認証が必要です' }
  const admin = createAdminClient()
  const { data, error: dbError } = await admin
    .from('inventory_items')
    .select('allocation, cost, sale_price, quantity, created_at')
    .eq('tenant_id', user.tenant_id)
    .eq('status', 'in_stock')
    .limit(20000)
  const rows = data ?? []
  const store = rows.filter((r) => r.allocation === 'store')
  const staleBefore = Date.now() - 60 * 86_400_000
  return {
    pendingCount: rows.filter((r) => r.allocation === 'pending').reduce((a, r) => a + r.quantity, 0),
    storeCount: store.reduce((a, r) => a + r.quantity, 0),
    storeCost: store.reduce((a, r) => a + r.cost * r.quantity, 0),
    storeValue: store.reduce((a, r) => a + (r.sale_price ?? 0) * r.quantity, 0),
    unpricedCount: store.filter((r) => r.sale_price === null).length,
    staleCount: store.filter((r) => new Date(r.created_at).getTime() < staleBefore).length,
    ready: !dbError,
  }
}
