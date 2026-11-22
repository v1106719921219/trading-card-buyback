import { syncBuybackIntake } from '@/actions/pos-sales'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { StockScreen, type StockTab } from '@/components/pos/stock-screen'
import type { ConditionRank, InventoryItem, PriceBand } from '@/types/database'

export const dynamic = 'force-dynamic'

/** 在庫（docs/pos/design.md 4 章 #9） */
export default async function PosStockPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const sp = await searchParams
  const tab: StockTab = (['pending', 'store', 'bands'] as const).includes(sp.tab as StockTab) ? (sp.tab as StockTab) : 'pending'
  const q = (sp.q ?? '').normalize('NFKC').trim().slice(0, 50)
  const tenantId = await requireTenantId()
  // 支払済の買取でまだ在庫に入っていない分を先に取り込む（支払い時の取り込みが失敗していても、ここで揃う）
  await syncBuybackIntake()
  const supabase = await createClient()

  const live = () => supabase.from('inventory_items').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'in_stock')
  let itemsReq = supabase
    .from('inventory_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'in_stock')
    .eq('allocation', tab === 'store' ? 'store' : 'pending')
    .order('created_at', { ascending: tab === 'pending' })
    .limit(300)
  if (q) {
    for (const t of q.split(/[\s　]+/).map((x) => x.replace(/[,%()."'\\]/g, '')).filter(Boolean).slice(0, 5)) {
      itemsReq = itemsReq.or(`name.ilike.%${t}%,model_number.ilike.%${t}%,barcode.ilike.%${t}%,psa_cert_number.ilike.%${t}%`)
    }
  }
  const [items, bands, ranks, pendingCount, storeCount, unpricedCount] = await Promise.all([
    tab === 'bands' ? Promise.resolve({ data: [] as InventoryItem[] }) : itemsReq,
    supabase.from('price_bands').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('sort_order'),
    supabase.from('condition_ranks').select('*').eq('tenant_id', tenantId).order('sort_order'),
    live().eq('allocation', 'pending'),
    live().eq('allocation', 'store'),
    live().eq('allocation', 'store').is('sale_price', null),
  ])
  return (
    <StockScreen
      tab={tab}
      q={q}
      items={(items.data ?? []) as InventoryItem[]}
      bands={(bands.data ?? []) as PriceBand[]}
      ranks={(ranks.data ?? []) as ConditionRank[]}
      counts={{ pending: pendingCount.count ?? 0, store: storeCount.count ?? 0, storeUnpriced: unpricedCount.count ?? 0 }}
    />
  )
}
