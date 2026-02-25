'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FolderOpen,
  CreditCard,
  ShieldCheck,
  Undo2,
  Users,
  Settings,
  LogOut,
  Building2,
  Calendar,
  Menu,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Profile } from '@/types/database'

const navItems = [
  { href: '/admin', label: 'ダッシュボード', icon: LayoutDashboard },
  { href: '/admin/orders', label: '注文管理', icon: ShoppingCart },
  { href: '/admin/offices', label: '事務所別管理', icon: Building2 },
  { href: '/admin/arrival-schedule', label: '到着予定', icon: Calendar },
  { href: '/admin/products', label: '商品管理', icon: Package },
  { href: '/admin/products/price-history', label: '価格履歴', icon: TrendingUp },
  { href: '/admin/categories', label: 'カテゴリ管理', icon: FolderOpen },
  { href: '/admin/payments', label: '振込管理', icon: CreditCard },
  { href: '/admin/payment-verification', label: '振込確認', icon: ShieldCheck },
  { href: '/admin/returns', label: '返品管理', icon: Undo2 },
  { href: '/admin/staff', label: 'スタッフ管理', icon: Users, adminOnly: true },
  { href: '/admin/settings', label: '設定', icon: Settings, adminOnly: true },
]

function NavLinks({ profile, onNavigate }: { profile: Profile; onNavigate?: () => void }) {
  const pathname = usePathname()

  const filteredItems = navItems.filter(
    (item) => !item.adminOnly || profile.role === 'admin'
  )

  return (
    <nav className="flex-1 space-y-1 p-4">
      {filteredItems.map((item) => {
        const isActive =
          item.href === '/admin'
            ? pathname === '/admin'
            : item.href === '/admin/products'
              ? pathname === '/admin/products'
              : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

function UserFooter({ profile, onLogout }: { profile: Profile; onLogout: () => void }) {
  return (
    <div className="border-t p-4">
      <div className="mb-2 px-3">
        <p className="text-sm font-medium">{profile.display_name}</p>
        <p className="text-xs text-muted-foreground">{profile.email}</p>
      </div>
      <Button
        variant="ghost"
        className="w-full justify-start gap-3 text-muted-foreground"
        onClick={onLogout}
      >
        <LogOut className="h-4 w-4" />
        ログアウト
      </Button>
    </div>
  )
}

export function AdminSidebar({ profile }: { profile: Profile }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-30 hidden md:flex h-screen w-64 flex-col border-r bg-card">
        <div className="flex h-16 items-center border-b px-6">
          <Link href="/admin" className="text-lg font-bold">
            買取スクエア
          </Link>
        </div>
        <NavLinks profile={profile} />
        <UserFooter profile={profile} onLogout={handleLogout} />
      </aside>

      {/* Mobile header + hamburger */}
      <div className="fixed top-0 left-0 right-0 z-30 flex md:hidden h-14 items-center border-b bg-card px-4 gap-3">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 flex flex-col">
            <SheetHeader className="border-b px-6 py-4">
              <SheetTitle>買取スクエア</SheetTitle>
            </SheetHeader>
            <NavLinks profile={profile} onNavigate={() => setOpen(false)} />
            <UserFooter profile={profile} onLogout={handleLogout} />
          </SheetContent>
        </Sheet>
        <Link href="/admin" className="text-lg font-bold">
          買取スクエア
        </Link>
      </div>
    </>
  )
}
