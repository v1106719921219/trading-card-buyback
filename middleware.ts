import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  // サブドメインからテナントslugを解決してヘッダーに追加
  const hostname = request.headers.get('host') || ''
  const url = request.nextUrl

  // 本番: quadra.yourdomain.com → slug = quadra
  // 開発: localhost:3000 → slug = デフォルト or クエリパラメータで指定
  const tenantSlug = resolveTenantSlug(hostname, url)

  // テナントslugをリクエストヘッダーに付与（Server Components / Server Actionsで参照）
  const requestHeaders = new Headers(request.headers)
  if (tenantSlug) {
    requestHeaders.set('x-tenant-slug', tenantSlug)
  }

  const response = await updateSession(
    new Request(request, { headers: requestHeaders })
  )

  return response
}

/**
 * ホスト名からテナントslugを解決する
 * 例:
 *   quadra.buyback.jp → 'quadra'
 *   localhost:3000    → 'quadra'（開発用デフォルト or ?tenant=xxxで切り替え）
 */
function resolveTenantSlug(hostname: string, url: URL): string | null {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000'

  // 開発環境: ?tenant=slug で切り替え可能
  if (hostname === 'localhost:3000' || hostname === '127.0.0.1:3000') {
    return url.searchParams.get('tenant') || process.env.DEFAULT_TENANT_SLUG || 'quadra'
  }

  // 本番: サブドメインを抽出
  // quadra.buyback.jp → quadra
  if (hostname.endsWith(`.${rootDomain}`)) {
    return hostname.replace(`.${rootDomain}`, '')
  }

  // ルートドメインそのもの（マーケティングサイト等）
  if (hostname === rootDomain) {
    return null
  }

  return null
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
