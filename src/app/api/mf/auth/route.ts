import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generatePkce, getAuthUrl } from '@/lib/mf'

export async function GET(request: Request) {
  // 管理者ログインチェック
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const { codeVerifier, codeChallenge } = generatePkce()
  const response = NextResponse.redirect(getAuthUrl(codeChallenge))
  response.cookies.set('mf_code_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10分
    path: '/api/mf',
  })
  return response
}
