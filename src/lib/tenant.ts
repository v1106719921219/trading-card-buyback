import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cache } from 'react'

export interface Tenant {
  id: string
  slug: string
  name: string
  display_name: string
  site_name: string | null
  contact_email: string | null
  ancient_dealer_number: string | null
  logo_url: string | null
  primary_color: string
  plan: 'starter' | 'standard' | 'pro'
  is_active: boolean
  ekyc_enabled: boolean
}

/**
 * 現在のリクエストのテナントを取得する（Server Components / Server Actions用）
 * middleware.tsが x-tenant-slug ヘッダーを付与している前提
 * ヘッダーが取得できない場合はDEFAULT_TENANT_SLUGにフォールバック
 */
export const getTenant = cache(async (): Promise<Tenant | null> => {
  const headersList = await headers()
  let slug = headersList.get('x-tenant-slug')

  // ミドルウェアからヘッダーが届かない場合のフォールバック
  if (!slug) {
    slug = process.env.DEFAULT_TENANT_SLUG || 'quadra'
  }

  // RLSをバイパスして確実にテナント情報を取得
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (error || !data) return null

  return data as Tenant
})

/**
 * テナントIDのみを取得（軽量版）
 */
export const getTenantId = cache(async (): Promise<string | null> => {
  const tenant = await getTenant()
  return tenant?.id ?? null
})

/**
 * Server Actions内でtenant_idを取得するためのヘルパー
 * 取得できなかった場合はエラーをthrow
 */
export async function requireTenantId(): Promise<string> {
  const tenantId = await getTenantId()
  if (!tenantId) {
    throw new Error('テナントが見つかりません')
  }
  return tenantId
}
