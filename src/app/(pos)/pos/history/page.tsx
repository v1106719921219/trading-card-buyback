import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { todayJst } from '@/lib/pos-buyback'
import { HistoryScreen, type HistoryRow, type HistoryFilter } from '@/components/pos/history-screen'

export const dynamic = 'force-dynamic'

const STATUS_GROUPS: Record<HistoryFilter, string[] | null> = {
  all: null,
  open: ['申込', '検品完了'],
  paid: ['振込済', '振込確認済'],
  cancelled: ['キャンセル'],
}

/**
 * 取引履歴（docs/pos/design.md 4 章 #12）。買取の一覧。既定は今日。
 * 詳細（再印刷・申込書 PDF）は受付の詳細画面 /pos/buy/[id] に任せる。販売の一覧は段階 2 で足す。
 */
export default async function PosHistoryPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; q?: string; status?: string }> }) {
  const sp = await searchParams
  const today = todayJst()
  const valid = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
  const from = valid(sp.from) ?? today
  const to = valid(sp.to) ?? today
  const q = (sp.q ?? '').normalize('NFKC').trim().slice(0, 50)
  const filter: HistoryFilter = (['all', 'open', 'paid', 'cancelled'] as const).includes(sp.status as HistoryFilter) ? (sp.status as HistoryFilter) : 'all'

  const tenantId = await requireTenantId()
  const supabase = await createClient()
  let req = supabase
    .from('orders')
    .select('id, order_number, status, customer_name, created_at, updated_at, total_amount, inspected_total_amount, inspection_discount, inspected_by_name, intake_count, notes, order_items(quantity, unit_price)')
    .eq('tenant_id', tenantId)
    .eq('channel', 'store')
    .gte('created_at', `${from}T00:00:00+09:00`)
    .lte('created_at', `${to}T23:59:59.999+09:00`)
    .order('created_at', { ascending: false })
    .limit(300)
  const statuses = STATUS_GROUPS[filter]
  if (statuses) req = req.in('status', statuses)
  if (q) {
    const safe = q.replace(/[,%()."'\\]/g, '')
    if (safe) req = req.or(`order_number.ilike.%${safe}%,customer_name.ilike.%${safe}%`)
  }
  const { data } = await req
  const rows: HistoryRow[] = (data ?? []).map((o) => {
    const items = (o.order_items ?? []) as { quantity: number; unit_price: number }[]
    const count = items.reduce((s, i) => s + i.quantity, 0)
    const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
    return {
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      customer_name: o.customer_name,
      created_at: o.created_at,
      updated_at: o.updated_at,
      item_count: count,
      total,
      inspected_by_name: o.inspected_by_name,
      intake_count: o.intake_count,
      notes: o.notes,
    }
  })
  return <HistoryScreen rows={rows} from={from} to={to} q={q} filter={filter} />
}
