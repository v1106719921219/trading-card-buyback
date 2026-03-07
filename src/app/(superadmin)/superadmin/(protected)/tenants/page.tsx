import { getTenants } from '@/actions/super-admin'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

const PLAN_COLORS = {
  starter: 'bg-gray-700 text-gray-300',
  standard: 'bg-blue-900 text-blue-300',
  pro: 'bg-yellow-900 text-yellow-300',
}

export default async function TenantsPage() {
  const tenants = await getTenants()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">テナント管理</h1>
          <p className="text-gray-400 mt-1">{tenants.length}社のテナント</p>
        </div>
        <Link
          href="/superadmin/tenants/new"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          + 新規テナント追加
        </Link>
      </div>

      {/* テナント一覧テーブル */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">テナント</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">Slug</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">プラン</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">ステータス</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">登録日</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {tenants.map((tenant) => (
              <tr key={tenant.id} className="hover:bg-gray-800/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-medium text-white">{tenant.name}</div>
                  <div className="text-sm text-gray-400">{tenant.display_name}</div>
                </td>
                <td className="px-6 py-4">
                  <code className="text-sm text-blue-400 bg-blue-950 px-2 py-0.5 rounded">
                    {tenant.slug}
                  </code>
                </td>
                <td className="px-6 py-4">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${PLAN_COLORS[tenant.plan as keyof typeof PLAN_COLORS]}`}>
                    {tenant.plan.toUpperCase()}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {tenant.is_active ? (
                    <span className="flex items-center gap-1.5 text-sm text-green-400">
                      <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                      稼働中
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-sm text-gray-500">
                      <span className="w-2 h-2 bg-gray-500 rounded-full"></span>
                      停止中
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-400">
                  {new Date(tenant.created_at).toLocaleDateString('ja-JP')}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/superadmin/tenants/${tenant.id}`}
                    className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    詳細 →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {tenants.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            テナントがまだ登録されていません
          </div>
        )}
      </div>
    </div>
  )
}
