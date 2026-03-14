import type { Tenant } from '@/lib/tenant'

/**
 * クライアントコンポーネントで使用するテナント情報
 * サーバー側で getTenant() した結果を渡す
 */
export interface TenantInfo {
  id: string
  slug: string
  siteName: string
  contactEmail: string
  ancientDealerNumber: string
  primaryColor: string
  logoUrl: string
}

/**
 * Tenant オブジェクトからクライアント用 TenantInfo に変換
 */
export function toTenantInfo(tenant: Tenant): TenantInfo {
  return {
    id: tenant.id,
    slug: tenant.slug,
    siteName: tenant.site_name || tenant.display_name || tenant.name,
    contactEmail: tenant.contact_email || '',
    ancientDealerNumber: tenant.ancient_dealer_number || '',
    primaryColor: tenant.primary_color || '',
    logoUrl: tenant.logo_url || '',
  }
}
