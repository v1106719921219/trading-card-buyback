import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * いまレジを担当している人の名前。店舗は 1 アカウントを共有するので、開局時に選んだ名前を
 * 査定確定の担当・申込書の立会・台帳の記録者名・明細書の担当に使う。開局していなければ null。
 */
export async function getCurrentOperatorName(tenantId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('register_sessions')
    .select('operator_name')
    .eq('tenant_id', tenantId)
    .is('closed_at', null)
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.operator_name?.trim() || null
}

/** 担当者名が選ばれていればそれを、なければアカウントの表示名を返す */
export async function resolveOperatorName(tenantId: string, fallback: string): Promise<string> {
  return (await getCurrentOperatorName(tenantId)) ?? fallback
}
