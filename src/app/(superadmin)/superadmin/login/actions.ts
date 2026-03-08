'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export async function verifySuperAdmin(userId: string): Promise<{ isSuperAdmin: boolean; debug?: string }> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'MISSING'
    const keyPrefix = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'MISSING').substring(0, 10)

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('super_admins')
      .select('id')
      .eq('id', userId)
      .single()

    const debugInfo = `url=${url.substring(8, 30)} key=${keyPrefix} userId=${userId.substring(0, 8)} error=${error?.message ?? 'none'} data=${data ? 'found' : 'null'}`

    if (error || !data) {
      return { isSuperAdmin: false, debug: debugInfo }
    }

    return { isSuperAdmin: true, debug: debugInfo }
  } catch (e) {
    return { isSuperAdmin: false, debug: `exception: ${e}` }
  }
}
