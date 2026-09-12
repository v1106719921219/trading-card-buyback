import { logout } from '@/actions/auth'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminSidebar } from '@/components/admin/sidebar'
import type { Profile } from '@/types/database'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || profile.is_active === false) return <main className="p-8"><p>このアカウントは利用できません。管理者にお問い合わせください。</p><form action={logout}><button type="submit">ログアウト</button></form></main>

  if (['admin', 'manager'].includes(profile.role)) {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error || data?.currentLevel !== 'aal2') redirect('/account-security')
  }

  return (
    <div className="min-h-screen">
      <AdminSidebar profile={profile as Profile} />
      <main className="md:ml-64 min-h-screen pt-14 md:pt-0">
        <div className="p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
