import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/security'
import { readPayload } from '@/lib/signed-payload'
import { exchangeAuthCode } from '@/lib/mf'

export async function GET(request: NextRequest) {
  const { user, error } = await requireRole(['admin', 'manager'])
  if (error || !user) return NextResponse.json({ error: '管理者の本人確認が必要です' }, { status: 403 })
  const url = new URL(request.url)
  const proof = readPayload<{ userId: string; tenantId: string; state: string; codeVerifier: string }>(request.cookies.get('mf_oauth')?.value ?? '', 'mf-oauth')
  const redirect = new URL('/admin/payment-verification', request.url)
  if (!proof || proof.userId !== user.id || proof.tenantId !== user.tenant_id || proof.state !== url.searchParams.get('state') || !url.searchParams.get('code')) {
    redirect.searchParams.set('mf_error', '連携の本人確認に失敗しました。最初からやり直してください')
  } else {
    try {
      await exchangeAuthCode(url.searchParams.get('code')!, proof.codeVerifier)
      redirect.searchParams.set('mf_connected', '1')
    } catch { redirect.searchParams.set('mf_error', 'MF連携に失敗しました。最初からやり直してください') }
  }
  const response = NextResponse.redirect(redirect)
  response.cookies.set('mf_oauth', '', { path: '/api/mf', maxAge: 0 })
  return response
}
