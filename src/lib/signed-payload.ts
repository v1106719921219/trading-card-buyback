import 'server-only'
import { createHmac, timingSafeEqual, createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'
function key() {
  const value = process.env.ORDER_ACCESS_SECRET
  if (!value || value.length < 32) throw new Error('署名鍵が未設定です')
  return value
}
export function signPayload(purpose: string, payload: object, ttlSeconds: number) {
  const body = Buffer.from(JSON.stringify({ purpose, payload, exp: Date.now() + ttlSeconds * 1000 })).toString('base64url')
  return body + '.' + createHmac('sha256', key()).update(body).digest('base64url')
}
export function readPayload<T>(token: string, purpose: string): T | null {
  try {
    if (typeof token !== 'string' || token.length > 1_000_000) return null
    const [body, sig, extra] = token.split('.')
    if (!body || !sig || extra) return null
    const expected = createHmac('sha256', key()).update(body).digest()
    const actual = Buffer.from(sig, 'base64url')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
    const value = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (value.purpose !== purpose || !Number.isFinite(value.exp) || value.exp <= Date.now()) return null
    return value.payload as T
  } catch { return null }
}
export function encryptSecret(value: string, context: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(key() + ':secret-at-rest-v1').digest(), iv)
  cipher.setAAD(Buffer.from(context))
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return ['enc1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
}
export function decryptSecret(value: string, context: string) {
  const [version, iv, tag, data] = value.split('.')
  if (version !== 'enc1') throw new Error('連携情報の移行が必要です')
  const cipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(key() + ':secret-at-rest-v1').digest(), Buffer.from(iv, 'base64url'))
  cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([cipher.update(Buffer.from(data, 'base64url')), cipher.final()]).toString('utf8')
}
