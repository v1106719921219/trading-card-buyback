import { getCurrentUser } from '@/actions/auth'
import { getAppraisalMasters } from '@/actions/pos-buyback'
import { createClient } from '@/lib/supabase/server'
import { getTenant } from '@/lib/tenant'
import { SettingsScreen } from '@/components/pos/settings-screen'
import type { ReceiptHeader } from '@/lib/pos-buyback'
import type { ConditionRank, PriceBand } from '@/types/database'

export const dynamic = 'force-dynamic'

/**
 * 設定（docs/pos/design.md 4 章 #14）。店舗情報・レシート文面、状態ランク表、価格帯。
 * 変更できるのは admin だけ。staff / manager は読むだけ（スリーブ色の対応表を見る用途）。
 */
export default async function PosSettingsPage() {
  const [tenant, user] = await Promise.all([getTenant(), getCurrentUser()])
  if (!tenant) return null
  // 既定値の投入（初回）は査定マスタの読み込みが担う
  await getAppraisalMasters()
  const supabase = await createClient()
  const [ranks, bands] = await Promise.all([
    supabase.from('condition_ranks').select('*').eq('tenant_id', tenant.id).order('sort_order').order('code'),
    supabase.from('price_bands').select('*').eq('tenant_id', tenant.id).order('sort_order').order('buy_price'),
  ])
  const header = (tenant.receipt_header ?? {}) as ReceiptHeader
  return (
    <SettingsScreen
      canEdit={user?.role === 'admin'}
      header={header}
      fallback={{ store_name: tenant.display_name || tenant.name, license_number: tenant.ancient_dealer_number ?? '' }}
      tenantFields={{
        invoice_registration_number: tenant.invoice_registration_number ?? '',
        high_value_approval_threshold: tenant.high_value_approval_threshold ?? null,
        customer_price_display: tenant.customer_price_display ?? 'ipad',
      }}
      ranks={((ranks.data ?? []) as ConditionRank[]).map((r) => ({ ...r, rate: r.rate === null ? null : Number(r.rate) }))}
      bands={(bands.data ?? []) as PriceBand[]}
    />
  )
}
