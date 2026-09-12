import { NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { resolveTenantSlug } from '@/lib/tenant-slug'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown'

  // ============================================================================
  // 1. Rate Limiting
  // ============================================================================

  // ログインページへのブルートフォース対策
  if (pathname === '/login' && request.method === 'POST') {
    const result = rateLimit(`login:${ip}`, RATE_LIMITS.login)
    if (!result.success) {
      return new NextResponse(
        JSON.stringify({ error: 'リクエストが多すぎます。しばらくしてからお試しください' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
          },
        }
      )
    }
  }

  // 申込フォームへのスパム対策
  if (pathname.startsWith('/apply') && request.method === 'POST') {
    const result = rateLimit(`apply:${ip}`, RATE_LIMITS.applyForm)
    if (!result.success) {
      return new NextResponse(
        JSON.stringify({ error: '申込が多すぎます。しばらくしてからお試しください' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
          },
        }
      )
    }
  }

  // ============================================================================
  // 2. テナントSlug解決（サブドメインから）
  // ============================================================================

  const hostname = request.headers.get('host') || ''
  const tenantSlug = resolveTenantSlug(hostname, request.nextUrl)

  // リクエストヘッダーに付与（Server Components / Server Actions で headers() 経由で参照可能）
  if (tenantSlug) {
    request.headers.set('x-tenant-slug', tenantSlug)
  }
  request.headers.set('x-real-ip', ip)

  // ============================================================================
  // 3. セッション更新（Supabase Auth）
  // ============================================================================

  const response = await updateSession(request)

  // レスポンスヘッダーにも付与（ブラウザ側での参照用）
  if (tenantSlug) {
    response.headers.set('x-tenant-slug', tenantSlug)
  }
  // Do not echo the caller's IP address into responses.

  // ============================================================================
  // 4. セキュリティヘッダー付与
  // ============================================================================

  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  // camera=(self): eKYC撮影で自オリジンのgetUserMediaを使うため。()にすると自サイトでもカメラが拒否される
  response.headers.set(
    'Permissions-Policy',
    'camera=(self), microphone=(), geolocation=()'
  )
  
  // 本番環境のみHSTSを設定
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    )
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}