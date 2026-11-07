import { headers } from 'next/headers'
import { resolveTenantSlug } from '@/lib/tenant-slug'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cache } from 'react'
import type { TenantMode } from '@/lib/store-mode'

export interface Tenant {
  id: string
  slug: string
  name: string
  display_name: string
  ancient_dealer_number: string | null
  logo_url: string | null
  primary_color: string
  plan: 'starter' | 'standard' | 'pro'
  is_active: boolean
  ekyc_enabled: boolean
  // 店舗 POS（docs/pos/design.md 2.2 節）。移行前の DB では undefined なので、読む側は online として扱う
  mode?: TenantMode
  cash_only?: boolean
  price_source_tenant_id?: string | null
  store_price_rate?: number
  price_sync_time?: string | null
  invoice_registration_number?: string | null
  receipt_header?: Record<string, unknown>
  printer_address?: string | null
  high_value_approval_threshold?: number | null
  customer_price_display?: 'ipad' | 'qr' | 'none'
}

/**
 * 現在のリクエストのテナントを取得する（Server Components / Server Actions用）
 * middleware.tsが x-tenant-slug ヘッダーを付与している前提
 * ヘッダーが取得できない場合はDEFAULT_TENANT_SLUGにフォールバック
 */
export const getTenant = cache(async (): Promise<Tenant | null> => {
  const headersList = await headers()
  // Derive the tenant from the routed host; never trust a caller-supplied tenant header.
  const slug = resolveTenantSlug(headersList.get('host') ?? '')

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
