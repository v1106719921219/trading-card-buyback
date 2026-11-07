import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { logout } from '@/actions/auth'
import { createClient } from '@/lib/supabase/server'
import { getTenant } from '@/lib/tenant'
import { isStoreMode } from '@/lib/store-mode'
import { PosShell } from '@/components/pos/pos-shell'
import type { Profile } from '@/types/database'

// iPad のホーム画面に追加したときに全画面で起動する（docs/pos/design.md 2.1 節）
export const metadata: Metadata = {
  title: '店舗 POS',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'POS' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/pos')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || profile.is_active === false) {
    return (
      <main className="p-8">
        <p>このアカウントは利用できません。管理者にお問い合わせください。</p>
        <form action={logout}><button type="submit" className="mt-4 underline">ログアウト</button></form>
      </main>
    )
  }

  // 管理画面と同じく、manager / admin は二段階認証済みのセッションでだけ使える（現金支払いの記録に必要）
  if (['admin', 'manager'].includes(profile.role)) {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error || data?.currentLevel !== 'aal2') redirect('/account-security')
  }

  const tenant = await getTenant()
  if (!tenant || !isStoreMode(tenant.mode)) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-xl font-bold">この店舗では POS は有効になっていません</h1>
          <p className="text-sm text-muted-foreground">
            POS は実店舗テナント（業態: 実店舗 POS）でだけ使えます。通販テナントでは管理画面をお使いください。
          </p>
          <Link href="/admin" className="inline-block underline">管理画面へ</Link>
        </div>
      </main>
    )
  }

  return (
    <PosShell profile={profile as Profile} tenantName={tenant.name}>
      {children}
    </PosShell>
  )
}
