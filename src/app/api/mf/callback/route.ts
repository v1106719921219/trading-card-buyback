import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeAuthCode } from '@/lib/mf'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const cookieHeader = request.headers.get('cookie') ?? ''
  const codeVerifier = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('mf_code_verifier='))
    ?.split('=')[1]

  const redirectTo = new URL('/admin/payment-verification', request.url)

  if (!code || !codeVerifier) {
    redirectTo.searchParams.set('mf_error', '認証コードの取得に失敗しました。再度お試しください')
    return NextResponse.redirect(redirectTo)
  }

  try {
    await exchangeAuthCode(code, codeVerifier)
    redirectTo.searchParams.set('mf_connected', '1')
  } catch (err) {
    redirectTo.searchParams.set('mf_error', err instanceof Error ? err.message : 'MF認証に失敗しました')
  }

  const response = NextResponse.redirect(redirectTo)
  response.cookies.delete('mf_code_verifier')
  return response
}
