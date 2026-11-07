import { getOperatorOptions, getRegisterSummary } from '@/actions/pos-checkout'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { RegisterScreen } from '@/components/pos/register-screen'
import type { CashMovement, RegisterSession } from '@/types/database'

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
  let summary: { expected: number; buybackPaid: number; salesCash: number } | null = null
  if (session) {
    const [{ data: mv }, s] = await Promise.all([
      supabase.from('cash_movements').select('*').eq('register_session_id', session.id).order('created_at', { ascending: false }),
      getRegisterSummary(session.id),
    ])
    movements = (mv ?? []) as CashMovement[]
    if (!s.error) summary = { expected: s.expected ?? 0, buybackPaid: s.buybackPaid ?? 0, salesCash: s.salesCash ?? 0 }
  }
  return <RegisterScreen session={session} movements={movements} summary={summary} recent={(recent ?? []) as RegisterSession[]} canClose operatorOptions={ops.names ?? []} />
}
