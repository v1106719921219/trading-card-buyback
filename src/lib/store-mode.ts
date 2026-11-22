/**
 * 店舗モード（実店舗 POS テナント）の純粋な判定。DB にもリクエストにも依存しない。
 * docs/pos/design.md 2.1 / 2.2 節。
 */

export type TenantMode = 'online' | 'store'

/** 店舗テナントの入口。権限を見て posLandingPath の画面へ振り分ける */
export const POS_HOME = '/pos'

/** 待機画面（客に見える。買取・販売の 2 ボタンだけ）。取引が終わるとここへ戻る */
export const POS_STANDBY = '/pos/standby'

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

/**
 * 店舗モードで開かせないページか。通販向けの公開ページに加えて、管理画面（/admin）も対象。
 * 店舗は POS の中だけで完結させる（2026-11-22 決定: 通販の管理画面と見分けがつかず迷うため）。
 * スタッフ管理・担当者名・設定は /pos の中にある。/account-security（二段階認証）は店舗でも使う。
 */
export function isStoreHiddenPath(pathname: string): boolean {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return true
  return isOnlineOnlyPath(pathname)
}

/** 数字（売上・粗利）を見られる権限か。staff には本日の状況・分析を出さない */
export function canSeePosFigures(role: unknown): boolean {
  return role === 'admin' || role === 'manager'
}

/** スタッフ管理（アカウントの追加・停止・担当者名）を使える権限か */
export function canManagePosStaff(role: unknown): boolean {
  return role === 'admin'
}

/**
 * /pos を開いたときの行き先。
 * 管理者・マネージャーはダッシュボード（本日の状況）、スタッフはレジ未開局なら開局画面、開局済みなら待機画面。
 */
export function posLandingPath(role: unknown, registerOpen: boolean): string {
  if (canSeePosFigures(role)) return '/pos/status'
  return registerOpen ? POS_STANDBY : '/pos/register'
}

/** ログイン後の戻り先として安全な同一オリジンのパスだけを通す */
export function safeRedirectPath(candidate: string | null | undefined, fallback: string): string {
  if (!candidate) return fallback
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) return fallback
  return candidate
}
