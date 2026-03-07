/**
 * セキュリティユーティリティ
 *
 * - エラーメッセージのサニタイズ
 * - 認証・認可チェック
 * - テナント境界の検証
 */

import { getCurrentUser } from '@/actions/auth'
import { requireTenantId } from '@/lib/tenant'
import type { UserRole } from '@/types/database'

// ============================================================================
// エラーメッセージのサニタイズ
// 内部エラー詳細をクライアントに漏洩させない
// ============================================================================

const SAFE_ERROR_MESSAGES: Record<string, string> = {
  'duplicate key': '既に同じデータが存在します',
  'foreign key': '関連するデータが存在するため削除できません',
  'not found': 'データが見つかりません',
  'permission denied': 'アクセス権限がありません',
  'unique constraint': '既に同じデータが登録されています',
}

export function sanitizeError(error: unknown): string {
  if (process.env.NODE_ENV === 'development') {
    // 開発環境では詳細を表示
    if (error instanceof Error) return error.message
    return String(error)
  }

  // 本番環境: エラーメッセージを安全なものに変換
  const msg = error instanceof Error ? error.message.toLowerCase() : ''
  for (const [key, safe] of Object.entries(SAFE_ERROR_MESSAGES)) {
    if (msg.includes(key)) return safe
  }
  return '処理に失敗しました。もう一度お試しください'
}

// ============================================================================
// 認証・認可チェック
// ============================================================================

/**
 * 認証済みユーザーを取得。未認証ならエラーを返す。
 */
export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    return { user: null, error: '認証が必要です' as const }
  }
  return { user, error: null }
}

/**
 * 指定ロールのユーザーのみ許可
 */
export async function requireRole(allowedRoles: UserRole[]) {
  const { user, error } = await requireAuth()
  if (error || !user) return { user: null, error: '認証が必要です' as const }

  if (!allowedRoles.includes(user.role as UserRole)) {
    return { user: null, error: '権限がありません' as const }
  }
  return { user, error: null }
}

// ============================================================================
// テナント境界の検証
// ============================================================================

/**
 * adminClientを使う操作で「操作対象のレコードが現在のテナントに属するか」を検証する
 * RLS をバイパスするadminClientと組み合わせて使用
 *
 * @example
 * const tenantId = await requireTenantId()
 * await assertBelongsToTenant(supabase, 'orders', orderId, tenantId)
 */
export async function assertBelongsToTenant(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  table: string,
  recordId: string,
  tenantId: string
): Promise<void> {
  const { data, error } = await supabase
    .from(table)
    .select('tenant_id')
    .eq('id', recordId)
    .single()

  if (error || !data) {
    throw new Error('レコードが見つかりません')
  }

  if (data.tenant_id !== tenantId) {
    // テナント不一致: セキュリティログを残す（本番ではSentry等に送る）
    console.error(`[SECURITY] Tenant mismatch: table=${table} id=${recordId} expected=${tenantId} actual=${data.tenant_id}`)
    throw new Error('アクセス権限がありません')
  }
}

/**
 * 申込フォームからのorder作成時、tenant_idがURLのテナントと一致するかを検証
 * 悪意あるリクエストで任意のtenant_idを送り込む攻撃を防ぐ
 */
export async function validateOrderTenantId(inputTenantId: string): Promise<string> {
  const expectedTenantId = await requireTenantId()

  if (inputTenantId !== expectedTenantId) {
    console.error(`[SECURITY] tenant_id mismatch in order creation: input=${inputTenantId} expected=${expectedTenantId}`)
    throw new Error('不正なリクエストです')
  }

  return expectedTenantId
}
