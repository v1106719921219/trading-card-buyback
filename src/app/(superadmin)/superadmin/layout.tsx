import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { LayoutDashboard, Building2, LogOut } from 'lucide-react'

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/superadmin/login')
  }

  const { data: superAdmin } = await supabase
    .from('super_admins')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!superAdmin) {
    redirect('/superadmin/login')
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* サイドバー */}
      <aside className="fixed left-0 top-0 h-full w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <div className="text-xs font-bold text-yellow-400 uppercase tracking-wider mb-1">
            🛡️ Super Admin
          </div>
          <div className="text-sm text-gray-300">{superAdmin.display_name}</div>
          <div className="text-xs text-gray-500">{superAdmin.email}</div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <Link
            href="/superadmin"
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <LayoutDashboard size={16} />
            ダッシュボード
          </Link>
          <Link
            href="/superadmin/tenants"
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <Building2 size={16} />
            テナント管理
          </Link>
        </nav>

        <div className="p-3 border-t border-gray-800">
          <form action="/api/superadmin/logout" method="POST">
            <button
              type="submit"
              className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <LogOut size={16} />
              ログアウト
            </button>
          </form>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <main className="ml-56 min-h-screen">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
