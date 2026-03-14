import { createAdminClient } from '@/lib/supabase/admin'

export interface ParsedItem {
  product_id: string
  product_name: string
  unit_price: number
  quantity: number
}

export type SessionState = 'idle' | 'awaiting_confirmation' | 'awaiting_customer_info'

export interface SessionData {
  state: SessionState
  parsed_items: ParsedItem[] | null
  raw_text: string | null
  office_id: string | null
}

export interface LineSession {
  id: string
  line_user_id: string
  tenant_id: string
  state: SessionState
  parsed_items: ParsedItem[] | null
  raw_text: string | null
  office_id: string | null
  created_at: string
  updated_at: string
}

export async function getSession(lineUserId: string, tenantId: string): Promise<LineSession | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('line_sessions')
    .select('*')
    .eq('line_user_id', lineUserId)
    .eq('tenant_id', tenantId)
    .single()

  if (error || !data) return null
  return data as LineSession
}

export async function upsertSession(
  lineUserId: string,
  tenantId: string,
  data: Partial<SessionData>
): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('line_sessions')
    .upsert(
      {
        line_user_id: lineUserId,
        tenant_id: tenantId,
        ...data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'line_user_id,tenant_id' }
    )
}

export async function clearSession(lineUserId: string, tenantId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('line_sessions')
    .delete()
    .eq('line_user_id', lineUserId)
    .eq('tenant_id', tenantId)
}
