import 'server-only'
import { createHmac } from 'node:crypto'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenantId } from '@/lib/tenant'

export async function consumeLimit(key: string, limit: number, seconds: number) {
  const { data, error } = await createAdminClient().rpc('consume_security_limit', { p_key: key, p_limit: limit, p_seconds: seconds })
  return !error && data === true
}
export async function limitPublicRequest(purpose: string, limit: number, seconds: number) {
  const tenantId = await requireTenantId()
  const h = await headers()
  const ip = (h.get('x-vercel-forwarded-for') ?? h.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
  const secret = process.env.ORDER_ACCESS_SECRET
  if (!secret) return false
  const hash = createHmac('sha256', secret).update(ip).digest('hex')
  return consumeLimit(`${tenantId}:${purpose}:${hash}`, limit, seconds)
}
