'use client'

import { createContext, useContext } from 'react'
import type { TenantInfo } from '@/lib/tenant-info'

export type { TenantInfo }

const TenantContext = createContext<TenantInfo | null>(null)

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
