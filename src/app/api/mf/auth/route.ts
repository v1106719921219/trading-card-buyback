import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { requireRole } from '@/lib/security'
import { signPayload } from '@/lib/signed-payload'
import { generatePkce, getAuthUrl } from '@/lib/mf'

export async function GET(request: Request) {
  const { user, error } = await requireRole(['admin', 'manager'])
  if (error || !user) return NextResponse.json({ error: '管理者の本人確認が必要です' }, { status: 403 })
  const expected = process.env.NEXT_PUBLIC_SITE_URL
  if (expected && new URL(request.url).origin !== new URL(expected).origin) return NextResponse.json({ error: 'URLが一致しません' }, { status: 400 })
  const { codeVerifier, codeChallenge } = generatePkce()
  const state = randomBytes(32).toString('base64url')
  const response = NextResponse.redirect(getAuthUrl(codeChallenge, state))
  response.cookies.set('mf_oauth', signPayload('mf-oauth', { userId: user.id, tenantId: user.tenant_id, state, codeVerifier }, 600), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 600, path: '/api/mf',
  })
  return response
}
