import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { cache } from 'react'

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
}

/**
 * 現在のリクエストのテナントを取得する（Server Components / Server Actions用）
 * middleware.tsが x-tenant-slug ヘッダーを付与している前提
 */
export const getTenant = cache(async (): Promise<Tenant | null> => {
  const headersList = await headers()
  const slug = headersList.get('x-tenant-slug')

  if (!slug) return null

  const supabase = await createClient()
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
