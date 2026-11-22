import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { SellScreen } from '@/components/pos/sell-screen'
import type { PriceBand } from '@/types/database'

export const dynamic = 'force-dynamic'

/** 販売（docs/pos/design.md 4 章 #8） */
export default async function PosSellPage() {
  const tenantId = await requireTenantId()
  const supabase = await createClient()
  const [{ data: bands }, { data: open }] = await Promise.all([
    supabase.from('price_bands').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('sort_order'),
    supabase.from('register_sessions').select('id').eq('tenant_id', tenantId).is('closed_at', null).limit(1).maybeSingle(),
  ])
  return <SellScreen bands={(bands ?? []) as PriceBand[]} registerOpen={!!open} />
}
