'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LayoutDashboard, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types/database'

/**
 * POS の外枠。上に店名・担当者・管理画面リンク・ログアウト、下に各画面。
 * iPad 横向きを主に想定し、セーフエリア分の余白を取る。
 */
export function PosShell({
  profile,
  tenantName,
  children,
}: {
  profile: Profile
  tenantName: string
  children: React.ReactNode
}) {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login?redirect=/pos')
    router.refresh()
  }

  return (
    <div
      className="min-h-screen bg-background text-foreground flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <header className="flex items-center gap-4 border-b bg-card px-4 h-12 shrink-0">
        <Link href="/pos" className="font-bold">
          {tenantName} <span className="text-muted-foreground font-normal text-sm">POS</span>
        </Link>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-muted-foreground hidden sm:inline">担当: {profile.display_name}</span>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LayoutDashboard className="h-4 w-4" />
            管理画面
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            ログアウト
          </button>
        </div>
      </header>
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  )
}
