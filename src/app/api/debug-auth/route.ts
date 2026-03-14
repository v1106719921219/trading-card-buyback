import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createAdminClient()
  const checks: Record<string, unknown> = {}

  // 1. List all auth users
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
  if (authError) {
    checks.authUsers = { error: authError.message }
  } else {
    checks.authUsers = authUsers.users.map(u => ({
      id: u.id,
      email: u.email,
      email_confirmed_at: u.email_confirmed_at,
      created_at: u.created_at,
    }))
  }

  // 2. List all profiles
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, display_name, role, tenant_id')

  if (profileError) {
    checks.profiles = { error: profileError.message, code: profileError.code }
  } else {
    checks.profiles = profiles
  }

  // 3. Check if profile IDs match auth user IDs
  if (authUsers && profiles) {
    const authIds = new Set(authUsers.users.map(u => u.id))
    const orphanProfiles = profiles?.filter(p => !authIds.has(p.id))
    const usersWithoutProfile = authUsers.users.filter(u => !profiles?.find(p => p.id === u.id))
    checks.orphanProfiles = orphanProfiles
    checks.usersWithoutProfile = usersWithoutProfile.map(u => ({ id: u.id, email: u.email }))
  }

  return NextResponse.json(checks, { status: 200 })
}
