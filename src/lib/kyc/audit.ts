import { createAdminClient } from '@/lib/supabase/admin'

/**
 * KYC監査ログを記録
 * TODO [Phase2] ログ改ざん防止・5年保管（認定対応）
 */
export async function writeKycAuditLog(params: {
  tenantId: string
  kycRequestId: string
  actorId?: string | null
  action: string
  details?: Record<string, unknown>
  ipAddress?: string | null
  userAgent?: string | null
}): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase.from('kyc_audit_logs').insert({
    tenant_id: params.tenantId,
    kyc_request_id: params.kycRequestId,
    actor_id: params.actorId ?? null,
    action: params.action,
    details: params.details ?? {},
    ip_address: params.ipAddress ?? null,
    user_agent: params.userAgent ?? null,
  })

  if (error) {
    console.error('[KYC Audit] Failed to write audit log:', error)
  }
}
