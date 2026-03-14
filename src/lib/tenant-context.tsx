'use client'

import { createContext, useContext } from 'react'
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
}

const TenantContext = createContext<TenantInfo | null>(null)

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
  }
}

export function TenantProvider({
  tenant,
  children,
}: {
  tenant: TenantInfo
  children: React.ReactNode
}) {
  return (
    <TenantContext.Provider value={tenant}>
      {children}
    </TenantContext.Provider>
  )
}

export function useTenant(): TenantInfo {
  const tenant = useContext(TenantContext)
  if (!tenant) {
    throw new Error('useTenant must be used within a TenantProvider')
  }
  return tenant
}

export function useTenantOptional(): TenantInfo | null {
  return useContext(TenantContext)
}
