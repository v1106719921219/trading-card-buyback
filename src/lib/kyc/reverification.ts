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
