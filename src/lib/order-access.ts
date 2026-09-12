import 'server-only'
import { createHmac, timingSafeEqual, createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyLineIdToken } from '@/lib/line-verify'

const TTL = 30 * 24 * 60 * 60

function secret() {
  const key = process.env.ORDER_ACCESS_SECRET
  if (!key || key.length < 32) throw new Error('ORDER_ACCESS_SECRET is not configured')
  return key
}

export function assertOrderAccessConfigured() { secret() }

function cookieName(tenantId: string, orderNumber: string) {
  return 'buyback-order-' + createHash('sha256').update(JSON.stringify([tenantId, orderNumber])).digest('hex').slice(0, 24)
}

function signature(tenantId: string, orderNumber: string, expires: string) {
  return createHmac('sha256', secret()).update(JSON.stringify(['order-access-v1', tenantId, orderNumber, expires])).digest('hex')
}

// Only call after creating the order or verifying its LINE owner.
export async function grantOrderAccess(tenantId: string, orderNumber: string) {
  const expires = String(Math.floor(Date.now() / 1000) + TTL)
  ;(await cookies()).set(cookieName(tenantId, orderNumber), `${expires}.${signature(tenantId, orderNumber, expires)}`, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: TTL,
  })
}

export async function hasOrderAccess(tenantId: string, orderNumber: string, idToken?: string): Promise<boolean> {
  if (!orderNumber || orderNumber.length > 100) return false
  const value = (await cookies()).get(cookieName(tenantId, orderNumber))?.value
  if (value && /^\d{10}\.[a-f0-9]{64}$/.test(value)) {
    const [expires, mac] = value.split('.')
    const now = Math.floor(Date.now() / 1000)
    if (Number(expires) > now && Number(expires) <= now + TTL &&
      timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(signature(tenantId, orderNumber, expires), 'hex'))) return true
  }
  if (!idToken) return false
  const verified = await verifyLineIdToken(idToken)
  if (!verified?.userId) return false
  const { data, error } = await createAdminClient().from('orders').select('id')
    .eq('tenant_id', tenantId).eq('order_number', orderNumber).eq('line_user_id', verified.userId).maybeSingle()
  if (error || !data) return false
  await grantOrderAccess(tenantId, orderNumber)
  return true
}
