import 'server-only'
import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
export function kycReverificationKey(lineUserId: string, name: string) {
  return `kyc_reverify:v1:${createHash('sha256').update(`${lineUserId}\0${name.replace(/[\s　]/g, '')}`).digest('hex')}`
}
export async function readReverificationCutoff(client: SupabaseClient, tenant: string, line: string, name: string): Promise<string | null> {
  const { data, error } = await client.from('app_settings').select('value').eq('tenant_id', tenant).eq('key', kycReverificationKey(line, name)).maybeSingle()
  if (error) throw new Error('本人確認の再登録状態を確認できません。時間をおいてお試しください。')
  if (!data) return null
  if (typeof data.value !== 'string' || !Number.isFinite(Date.parse(data.value))) throw new Error('本人確認の再登録状態を確認してください。')
  return data.value
}
export function approvalAfterCutoff(createdAt: string | null | undefined, cutoff: string | null) {
  return !cutoff || (!!createdAt && Date.parse(createdAt) >= Date.parse(cutoff))
}

/** Administrative display only; original approval/evidence stays unchanged. */
export async function kycReverificationLabels<T extends { tenant_id: string; line_user_id?: string | null; customer_name: string | null; created_at: string }>(client: SupabaseClient, tenant: string, rows: T[]) {
  const eligible = rows.filter(r => r.tenant_id === tenant && r.line_user_id && r.customer_name)
  if (!eligible.length) return rows.map(r => ({ ...r, reverification_required: false }))
  const keys = [...new Set(eligible.map(r => kycReverificationKey(r.line_user_id!, r.customer_name!)))]
  const { data, error } = await client.from('app_settings').select('key,value').eq('tenant_id', tenant).in('key', keys)
  if (error) throw new Error('再登録状態を読み込めませんでした。再読み込みしてください。')
  const cutoffs = new Map((data ?? []).map(s => [s.key, s.value as string]))
  const validDates = [...cutoffs.values()].filter(v => Number.isFinite(Date.parse(v)))
  let fresh: { line_user_id: string; customer_name: string | null; created_at: string }[] = []
  if (validDates.length) {
    const result = await client.from('kyc_requests').select('line_user_id,customer_name,created_at')
      .eq('tenant_id', tenant).eq('status', 'approved').is('ocr_result->shared_approval', null)
      .in('line_user_id', [...new Set(eligible.map(r => r.line_user_id!))])
      .gte('created_at', validDates.sort((a, b) => Date.parse(a) - Date.parse(b))[0])
    if (result.error) throw new Error('再登録状態を読み込めませんでした。再読み込みしてください。')
    fresh = result.data ?? []
  }
  return rows.map(r => {
    const cutoff = r.tenant_id === tenant && r.line_user_id && r.customer_name ? cutoffs.get(kycReverificationKey(r.line_user_id, r.customer_name)) : null
    const required = !!cutoff && !approvalAfterCutoff(r.created_at, cutoff)
    const completed = required && fresh.some(k => k.line_user_id === r.line_user_id && (k.customer_name ?? '').replace(/[\s　]/g, '') === (r.customer_name ?? '').replace(/[\s　]/g, '') && approvalAfterCutoff(k.created_at, cutoff))
    return { ...r, reverification_required: required, reverification_completed: completed }
  })
}
