import { getSuperAdminStats } from '@/actions/super-admin'
import { Building2, ShoppingCart, TrendingUp } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function SuperAdminDashboard() {
  const stats = await getSuperAdminStats()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">ダッシュボード</h1>
        <p className="text-gray-400 mt-1">プラットフォーム全体の概要</p>
      </div>

      {/* KPIカード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Building2 size={20} className="text-blue-400" />
            </div>
            <span className="text-sm text-gray-400">テナント数</span>
          </div>
          <div className="text-3xl font-bold text-white">{stats.totalTenants}</div>
          <div className="text-sm text-green-400 mt-1">稼働中: {stats.activeTenants}</div>
        </div>

        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <ShoppingCart size={20} className="text-green-400" />
            </div>
            <span className="text-sm text-gray-400">直近30日の注文</span>
          </div>
          <div className="text-3xl font-bold text-white">{stats.ordersLast30Days}</div>
          <div className="text-sm text-gray-500 mt-1">全テナント合計</div>
        </div>

        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <TrendingUp size={20} className="text-purple-400" />
            </div>
            <span className="text-sm text-gray-400">プラン内訳</span>
          </div>
          <div className="space-y-1 mt-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Starter</span>
              <span className="text-white">{stats.planBreakdown.starter}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Standard</span>
              <span className="text-white">{stats.planBreakdown.standard}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-yellow-400 font-medium">Pro</span>
              <span className="text-yellow-400 font-medium">{stats.planBreakdown.pro}</span>
            </div>
          </div>
        </div>
      </div>

      {/* クイックリンク */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">クイックアクション</h2>
        <div className="flex gap-4">
          <a
            href="/superadmin/tenants/new"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            + 新規テナント追加
          </a>
          <a
            href="/superadmin/tenants"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            テナント一覧
          </a>
        </div>
      </div>
    </div>
  )
}
