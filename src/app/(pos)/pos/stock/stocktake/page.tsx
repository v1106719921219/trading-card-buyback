import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { StocktakeCountScreen, StocktakeStartScreen } from '@/components/pos/stocktake-screen'
import type { Stocktake, StocktakeLine } from '@/types/database'

export const dynamic = 'force-dynamic'

const CHUNK = 1000
const MAX_LINES = 10000

/** 棚卸し（docs/pos/design.md 6.4 節）。進行中があれば実数の入力、なければ開始と履歴 */
export default async function PosStocktakePage() {
  const tenantId = await requireTenantId()
  const supabase = await createClient()
  const { data: open } = await supabase.from('stocktakes').select('*').eq('tenant_id', tenantId).eq('status', 'open').maybeSingle()

  if (!open) {
    const { data: history } = await supabase.from('stocktakes').select('*').eq('tenant_id', tenantId).neq('status', 'open').order('started_at', { ascending: false }).limit(30)
    return <StocktakeStartScreen history={(history ?? []) as Stocktake[]} />
  }

  // 1 回の読み取りは 1,000 行までなので、位置の順に続きを読む
  const lines: StocktakeLine[] = []
  let truncated = false
  for (let after = 0; ; ) {
    const { data } = await supabase
      .from('stocktake_lines')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('stocktake_id', open.id)
      .gt('position', after)
      .order('position')
      .limit(CHUNK)
    const rows = (data ?? []) as StocktakeLine[]
    lines.push(...rows)
    if (rows.length < CHUNK) break
    if (lines.length >= MAX_LINES) {
      truncated = true
      break
    }
    after = rows[rows.length - 1].position
  }
  return <StocktakeCountScreen key={open.id} stocktake={open as Stocktake} initialLines={lines} truncated={truncated} />
}
