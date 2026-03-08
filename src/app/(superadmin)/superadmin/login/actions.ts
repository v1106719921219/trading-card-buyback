'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export async function verifySuperAdmin(userId: string): Promise<{ isSuperAdmin: boolean }> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('super_admins')
      .select('id')
      .eq('id', userId)
      .single()

    if (error || !data) {
      return { isSuperAdmin: false }
    }

    return { isSuperAdmin: true }
  } catch {
    return { isSuperAdmin: false }
  }
}
