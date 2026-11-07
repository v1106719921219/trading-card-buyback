import { createAdminClient } from '@/lib/supabase/admin'
import type { TenantMode } from '@/lib/store-mode'

/**
 * proxy（全リクエスト）から呼ぶため、テナントの mode だけを短時間キャッシュして返す。
 * DB に届かない・列がまだ無い・テナントが無い場合は null を返し、呼び出し側は通販として扱う。
 */
const TTL_MS = 60_000
const ERROR_TTL_MS = 10_000
const cache = new Map<string, { mode: TenantMode | null; until: number }>()

export async function getTenantMode(slug: string): Promise<TenantMode | null> {
  const hit = cache.get(slug)
  if (hit && hit.until > Date.now()) return hit.mode

  let mode: TenantMode | null = null
  let ttl = TTL_MS
  try {
    const { data, error } = await createAdminClient()
      .from('tenants')
      .select('mode')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle()
    if (error) {
      ttl = ERROR_TTL_MS
    } else if (data) {
      mode = (data as { mode?: string }).mode === 'store' ? 'store' : 'online'
    }
  } catch {
    ttl = ERROR_TTL_MS
  }
  cache.set(slug, { mode, until: Date.now() + ttl })
  return mode
}

/** テスト・設定変更直後用 */
export function clearTenantModeCache() {
  cache.clear()
}
