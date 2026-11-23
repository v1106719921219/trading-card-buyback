import { getOperatorOptions, getRegisterSummary } from '@/actions/pos-checkout'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { RegisterScreen } from '@/components/pos/register-screen'
import { suggestedOpeningFloat } from '@/lib/pos-register'
import type { CashMovement, RegisterSession, RegisterSpotCount } from '@/types/database'

export const dynamic = 'force-dynamic'

/** レジ（docs/pos/design.md 4 章 #10） */
export default async function PosRegisterPage() {
  const tenantId = await requireTenantId()
  const supabase = await createClient()
  const [{ data: open }, { data: recent }, ops] = await Promise.all([
    supabase.from('register_sessions').select('*').eq('tenant_id', tenantId).is('closed_at', null).order('opened_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('register_sessions').select('*').eq('tenant_id', tenantId).not('closed_at', 'is', null).order('closed_at', { ascending: false }).limit(10),
    getOperatorOptions(),
  ])
  const session = (open as RegisterSession | null) ?? null
  let movements: CashMovement[] = []
  let spotCounts: RegisterSpotCount[] = []
  let summary: { expected: number; buybackPaid: number; salesCash: number } | null = null
  if (session) {
    const [{ data: mv }, { data: sc }, s] = await Promise.all([
      supabase.from('cash_movements').select('*').eq('register_session_id', session.id).order('created_at', { ascending: false }),
      supabase.from('register_spot_counts').select('*').eq('tenant_id', tenantId).eq('register_session_id', session.id).order('created_at', { ascending: false }),
      getRegisterSummary(session.id),
    ])
    movements = (mv ?? []) as CashMovement[]
    spotCounts = (sc ?? []) as RegisterSpotCount[]
    if (!s.error) summary = { expected: s.expected ?? 0, buybackPaid: s.buybackPaid ?? 0, salesCash: s.salesCash ?? 0 }
  }
  const recentSessions = (recent ?? []) as RegisterSession[]
  // 最近の締めに、その日の途中点検を時間順で付ける
  const { data: recentSpots } = recentSessions.length
    ? await supabase
        .from('register_spot_counts')
        .select('*')
        .eq('tenant_id', tenantId)
        .in('register_session_id', recentSessions.map((r) => r.id))
        .order('created_at', { ascending: true })
    : { data: [] }
  return (
    <RegisterScreen
      // 開局・閉局で入力欄の初期値（準備金・翌日に残す額）を取り直す
      key={session?.id ?? `closed-${recentSessions[0]?.id ?? 'none'}`}
      session={session}
      movements={movements}
      spotCounts={spotCounts}
      recentSpotCounts={(recentSpots ?? []) as RegisterSpotCount[]}
      summary={summary}
      recent={recentSessions}
      canClose
      operatorOptions={ops.names ?? []}
      suggestedFloat={suggestedOpeningFloat(recentSessions[0])}
    />
  )
}
