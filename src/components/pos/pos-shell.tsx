'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  History,
  Home,
  LayoutGrid,
  LogOut,
  Package,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { canManagePosStaff, canSeePosFigures } from '@/lib/store-mode'
import type { Profile } from '@/types/database'

interface RailItem {
  href: string
  label: string
  icon: LucideIcon
  /** 売上・粗利などの数字が出る画面。admin / manager にだけ出す */
  figures?: boolean
  /** admin にだけ出す */
  adminOnly?: boolean
}

/**
 * 左端のメニュー。並びはモックアップ（docs/pos/mockup.html）に合わせる。
 * 権限で出し分ける（2026-11-22）: スタッフには 状況・分析・スタッフ を出さない。
 * 「価格表」は通販からの価格同期（段階 3）とセットで足す
 */
const RAIL_ITEMS: RailItem[] = [
  { href: '/pos/status', label: '状況', icon: Home, figures: true },
  { href: '/pos/standby', label: '待機', icon: LayoutGrid },
  { href: '/pos/buy', label: '買取', icon: ClipboardList },
  { href: '/pos/sell', label: '販売', icon: ShoppingCart },
  { href: '/pos/stock', label: '在庫', icon: Package },
  { href: '/pos/register', label: 'レジ', icon: Wallet },
  { href: '/pos/history', label: '履歴', icon: History },
  { href: '/pos/analytics', label: '分析', icon: BarChart3, figures: true },
  { href: '/pos/ledger', label: '台帳', icon: BookOpen },
  { href: '/pos/staff', label: 'スタッフ', icon: Users, adminOnly: true },
  { href: '/pos/settings', label: '設定', icon: Settings },
]

/** 権限に応じて出すメニュー */
export function visibleRailItems(items: RailItem[], role: string): RailItem[] {
  return items.filter((item) => {
    if (item.figures && !canSeePosFigures(role)) return false
    if (item.adminOnly && !canManagePosStaff(role)) return false
    return true
  })
}

function isActive(pathname: string, item: RailItem): boolean {
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

/**
 * POS の外枠。左端に縦のメニュー（iPad 横向き）、狭い画面では上に横並びで出す。
 * メニューの下に担当者・ログアウトを置く。店舗では管理画面（/admin）を使わないのでリンクは無い。セーフエリア分の余白を取る。
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
  const pathname = usePathname()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login?redirect=/pos')
    router.refresh()
  }

  const itemClass = (on: boolean) =>
    `flex shrink-0 items-center gap-1 rounded-[10px] px-3 py-2 text-xs whitespace-nowrap md:flex-col md:px-1 md:py-2.5 ${
      on ? 'bg-primary/10 text-primary font-bold' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    }`

  return (
    <div
      className="min-h-screen bg-background text-foreground flex flex-col md:flex-row"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <nav
        aria-label="POS メニュー"
        className="sticky top-0 z-20 flex shrink-0 items-center gap-1 overflow-x-auto border-b bg-card px-2 py-1.5 md:h-screen md:w-[76px] md:flex-col md:items-stretch md:overflow-x-visible md:overflow-y-auto md:border-b-0 md:border-r md:px-1.5 md:py-2.5"
        style={{ paddingLeft: 'max(6px, env(safe-area-inset-left))' }}
      >
        <div className="hidden pb-2 pt-1 text-center text-xs font-bold tracking-widest text-muted-foreground md:block">POS</div>
        {visibleRailItems(RAIL_ITEMS, profile.role).map((item) => {
          const on = isActive(pathname, item)
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href} aria-current={on ? 'page' : undefined} className={itemClass(on)}>
              <Icon className="h-[22px] w-[22px]" strokeWidth={1.8} />
              {item.label}
            </Link>
          )
        })}
        <div className="hidden flex-1 md:block" />
        <Link href="/pos/register" className="hidden px-1 py-1 text-center text-[11px] leading-snug text-muted-foreground hover:text-foreground md:block">
          <span className="block truncate" title={tenantName}>{tenantName}</span>
          {operatorName ? (
            <span className="block truncate" title={profile.display_name}>担当: {operatorName}</span>
          ) : (
            <span className="block text-amber-700">レジ未開局</span>
          )}
        </Link>
        <button type="button" onClick={handleLogout} className={itemClass(false)}>
          <LogOut className="h-[22px] w-[22px]" strokeWidth={1.8} />
          ログアウト
        </button>
      </nav>
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  )
}
