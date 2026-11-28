import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { StocktakeResultScreen } from '@/components/pos/stocktake-screen'
import type { Stocktake, StocktakeLine } from '@/types/database'

export const dynamic = 'force-dynamic'

/** 棚卸しの結果（確定・中止したあと）。差のあった行だけを出す */
export default async function PosStocktakeResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const tenantId = await requireTenantId()
  const supabase = await createClient()
  const { data: stocktake } = await supabase.from('stocktakes').select('*').eq('tenant_id', tenantId).eq('id', id).maybeSingle()
  if (!stocktake) notFound()
  if (stocktake.status === 'open') redirect('/pos/stock/stocktake')
  // 差のあった行だけ読む（1 回の読み取りは 1,000 行まで）
  const { data: lines } = await supabase
    .from('stocktake_lines')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('stocktake_id', id)
    .eq('has_diff', true)
    .order('position')
    .limit(1000)
  return <StocktakeResultScreen stocktake={stocktake as Stocktake} lines={(lines ?? []) as StocktakeLine[]} />
}
