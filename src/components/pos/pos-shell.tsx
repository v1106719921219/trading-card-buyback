'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BookOpen, ClipboardList, History, LayoutDashboard, LogOut, Settings, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types/database'

/**
 * POS の外枠。上に店名・担当者・管理画面リンク・ログアウト、下に各画面。
 * iPad 横向きを主に想定し、セーフエリア分の余白を取る。
 */
export function PosShell({
  profile,
  tenantName,
  operatorName,
  children,
}: {
  profile: Profile
  tenantName: string
  operatorName?: string | null
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
        <nav className="hidden items-center gap-1 text-sm sm:flex">
          <Link href="/pos/buy" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <ClipboardList className="h-4 w-4" />
            買取
          </Link>
          <Link href="/pos/register" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Wallet className="h-4 w-4" />
            レジ
          </Link>
          <Link href="/pos/history" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <History className="h-4 w-4" />
            履歴
          </Link>
          <Link href="/pos/ledger" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <BookOpen className="h-4 w-4" />
            台帳
          </Link>
          <Link href="/pos/settings" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Settings className="h-4 w-4" />
            設定
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm">
          {operatorName ? (
            <Link href="/pos/register" className="hidden sm:inline rounded-md px-2 py-1 hover:bg-muted">
              担当: <span className="font-medium">{operatorName}</span>
            </Link>
          ) : (
            <Link href="/pos/register" className="hidden sm:inline rounded-md px-2 py-1 text-amber-700 hover:bg-muted">
              レジ未開局（担当者未選択）
            </Link>
          )}
          <span className="text-muted-foreground hidden lg:inline text-xs">{profile.display_name}</span>
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
