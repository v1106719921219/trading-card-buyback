/**
 * 店舗モード（実店舗 POS テナント）の純粋な判定。DB にもリクエストにも依存しない。
 * docs/pos/design.md 2.1 / 2.2 節。
 */

export type TenantMode = 'online' | 'store'

/** 店舗テナントで最初に開く画面（待機画面） */
export const POS_HOME = '/pos'

/** 通販専用の公開ページ。店舗モードではここへの来訪を POS_HOME へ送る */
const ONLINE_ONLY_PREFIXES = [
  '/apply',
  '/prices',
  '/my-orders',
  '/track',
  '/tracking',
  '/kyc',
  '/guide',
  '/quality-guide',
]

export function isStoreMode(mode: unknown): mode is 'store' {
  return mode === 'store'
}

/**
 * 店舗モードで隠す通販向けページか。
 * /login, /admin, /pos, /account-security, /privacy, /terms, /api, /auth は店舗でも使うので対象外。
 */
export function isOnlineOnlyPath(pathname: string): boolean {
  if (pathname === '/') return true
  return ONLINE_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

/** ログイン後の戻り先として安全な同一オリジンのパスだけを通す */
export function safeRedirectPath(candidate: string | null | undefined, fallback: string): string {
  if (!candidate) return fallback
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) return fallback
  return candidate
}
