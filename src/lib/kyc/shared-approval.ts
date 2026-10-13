import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Only these two deployments/tenants share approvals. Never accept a source URL or tenant from a browser.
const sites = {
  tokyo: { url: 'https://hbvkaidvrwgskjtvvwfw.supabase.co', tenant: 'aaaaaaaa-0000-0000-0000-000000000001', prefix: 'TOKYO' },
  chiba: { url: 'https://fqbtulaerxrnekbkjlhu.supabase.co', tenant: '8649ca8a-4393-4510-839f-3c08ead6ae21', prefix: 'CHIBA' },
} as const
export type SharedSite = keyof typeof sites
const norm = (s: string | null) => (s ?? '').replace(/[\s　]/g, '')
export type Approval = {
  id: string; customer_name: string; id_document_type: string; reviewed_at: string | null
  expires_at: string | null; source?: SharedSite
}

export function peerFor(tenant: string) {
  const current = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
  const here = (Object.keys(sites) as SharedSite[]).find(k => sites[k].url === current && sites[k].tenant === tenant)
  if (!here) return null
  const source: SharedSite = here === 'tokyo' ? 'chiba' : 'tokyo'
  const config = sites[source]
  const url = process.env[`${config.prefix}_SUPABASE_URL`]?.replace(/\/$/, '')
  const key = process.env[`${config.prefix}_SUPABASE_SERVICE_ROLE_KEY`]
  if (url !== config.url || !key) return null
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(4000) }) } })
  return { source, tenant: config.tenant, client }
}

async function lookup(client: SupabaseClient, tenant: string, lineUserId: string, name: string): Promise<Approval | null> {
  const { data, error } = await client.from('kyc_requests')
    .select('id, customer_name, id_document_type, reviewed_at, expires_at')
    .eq('tenant_id', tenant).eq('line_user_id', lineUserId).eq('status', 'approved')
    // Receipts must not become new sources (including after the original is revoked).
    .is('ocr_result->shared_approval', null)
    .order('reviewed_at', { ascending: false }).limit(100)
  if (error) throw new Error('本人確認の照合に失敗しました。時間をおいて再度お試しください。')
  return (data ?? []).find(k => norm(k.customer_name) === norm(name)) ?? null
}

// lineUserId must already have been verified by the server's LINE token verification.
export async function findApprovedKyc(client: SupabaseClient, tenant: string, lineUserId: string, name: string): Promise<Approval | null> {
  if (!lineUserId || !norm(name)) return null
  const local = await lookup(client, tenant, lineUserId, name)
  if (local) return local
  const peer = peerFor(tenant)
  if (!peer) return null
  const approved = await lookup(peer.client, peer.tenant, lineUserId, name)
  return approved ? { ...approved, source: peer.source } : null
}

export async function recordSharedApproval(client: SupabaseClient, tenant: string, lineUserId: string, approval: Approval): Promise<string> {
  if (!approval.source) return approval.id
  const peer = peerFor(tenant)
  if (!peer || peer.source !== approval.source) throw new Error('本人確認の連携設定を確認してください。')
  // Recheck the source immediately before issuing a receipt. No image/OCR/address copying.
  const fresh = await lookup(peer.client, peer.tenant, lineUserId, approval.customer_name)
  if (!fresh || fresh.id !== approval.id) throw new Error('本人確認の承認状態が変わりました。再度確認してください。')
  const proof = { version: 1, source: peer.source, tenant_id: peer.tenant, request_id: fresh.id, reviewed_at: fresh.reviewed_at, checked_at: new Date().toISOString() }
  const { data, error } = await client.from('kyc_requests').insert({
    tenant_id: tenant, line_user_id: lineUserId, customer_name: fresh.customer_name, customer_email: null,
    status: 'approved', kyc_method: 'image', id_document_type: fresh.id_document_type,
    reviewed_at: fresh.reviewed_at, expires_at: fresh.expires_at, ocr_result: { shared_approval: proof },
  }).select('id').single()
  if (error || !data) throw new Error('本人確認済み情報の記録に失敗しました。再度お試しください。')
  const audit = await client.from('kyc_audit_logs').insert({ tenant_id: tenant, kyc_request_id: data.id, action: 'cross_office_approval_reused', details: proof })
  if (audit.error) throw new Error('本人確認の履歴記録に失敗しました。再度お試しください。')
  return data.id
}
