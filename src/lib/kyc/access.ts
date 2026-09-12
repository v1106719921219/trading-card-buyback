import 'server-only'
import { grantOrderAccess, hasOrderAccess } from '@/lib/order-access'

export async function grantKycAccess(tenantId: string, id: string) {
  await grantOrderAccess(tenantId, 'kyc:' + id, 2 * 3600)
}
export async function hasKycAccess(tenantId: string, id: string) {
  return hasOrderAccess(tenantId, 'kyc:' + id)
}
