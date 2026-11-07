import { getCurrentUser } from '@/actions/auth'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { todayJst } from '@/lib/pos-buyback'
import { LedgerScreen, type LedgerRow } from '@/components/pos/ledger-screen'
import type { KobutsuLedgerEntry } from '@/types/database'

export const dynamic = 'force-dynamic'

/** 古物台帳（docs/pos/design.md 4 章 #11）。既定は今月 */
export default async function PosLedgerPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams
  const today = todayJst()
  const valid = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
  const from = valid(sp.from) ?? `${today.slice(0, 7)}-01`
  const to = valid(sp.to) ?? today
  const tenantId = await requireTenantId()
  const supabase = await createClient()
  const [{ data }, user] = await Promise.all([
    supabase
      .from('kobutsu_ledger')
      .select('*, orders(order_number)')
      .eq('tenant_id', tenantId)
      .gte('transacted_on', from)
      .lte('transacted_on', to)
      .order('transacted_on', { ascending: false })
      .order('recorded_at', { ascending: false })
      .limit(1000),
    getCurrentUser(),
  ])
  const rows: LedgerRow[] = ((data ?? []) as (KobutsuLedgerEntry & { orders: { order_number: string } | null })[]).map((r) => ({
    ...r,
    order_number: r.orders?.order_number ?? null,
  }))
  const canExport = user?.role === 'admin'
  return <LedgerScreen rows={rows} from={from} to={to} canExport={canExport} />
}
