import 'server-only'
import { requireRole } from '@/lib/security'
import { getTenant, type Tenant } from '@/lib/tenant'
import { isStoreMode } from '@/lib/store-mode'
import type { UserRole } from '@/types/database'

export interface PosUser {
  id: string
  tenant_id: string
  display_name: string
  role: UserRole
}

/**
 * POS のサーバーアクション用。店舗テナントのスタッフだけを通す（admin / manager は MFA 済み）。
 * roles を絞れば現金支払いのように manager 以上だけの操作にできる。
 */
export async function requirePosUser(
  roles: UserRole[] = ['admin', 'manager', 'staff']
): Promise<{ user: PosUser; tenant: Tenant; error: null } | { user: null; tenant: null; error: string }> {
  const { user, error } = await requireRole(roles)
  if (error || !user) return { user: null, tenant: null, error: error ?? '認証が必要です' }
  const tenant = await getTenant()
  if (!tenant || !isStoreMode(tenant.mode)) return { user: null, tenant: null, error: 'この店舗では POS は有効になっていません' }
  return { user: user as PosUser, tenant, error: null }
}
