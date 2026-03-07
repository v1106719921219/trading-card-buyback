import { getTenant, getTenantStaff } from '@/actions/super-admin'
import { notFound } from 'next/navigation'
import { TenantActions } from './tenant-actions'
import { AddStaffForm } from './add-staff-form'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const PLAN_LABELS = {
  starter: 'Starter',
  standard: 'Standard',
  pro: 'Pro',
}

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [tenant, staff] = await Promise.all([
    getTenant(id),
    getTenantStaff(id),
  ])

  if (!tenant) notFound()

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/superadmin/tenants" className="hover:text-gray-300">テナント一覧</Link>
        <span>›</span>
        <span className="text-gray-300">{tenant.name}</span>
      </div>

      {/* テナント情報 */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">{tenant.name}</h1>
            <p className="text-gray-400">{tenant.display_name}</p>
          </div>
          <div className="flex items-center gap-3">
            {tenant.is_active ? (
              <span className="flex items-center gap-1.5 text-sm text-green-400 bg-green-950 px-3 py-1 rounded-full">
                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                稼働中
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-sm text-gray-400 bg-gray-800 px-3 py-1 rounded-full">
                <span className="w-2 h-2 bg-gray-500 rounded-full"></span>
                停止中
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-gray-500 mb-1">Slug</div>
            <code className="text-sm text-blue-400">{tenant.slug}</code>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">プラン</div>
            <div className="text-sm text-white">{PLAN_LABELS[tenant.plan as keyof typeof PLAN_LABELS]}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">古物商許可番号</div>
            <div className="text-sm text-white">{tenant.ancient_dealer_number || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">テーマカラー</div>
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded-full border border-gray-600"
                style={{ backgroundColor: tenant.primary_color }}
              />
              <span className="text-sm text-white">{tenant.primary_color}</span>
            </div>
          </div>
        </div>

        {/* アクション */}
        <TenantActions tenant={tenant} />
      </div>

      {/* スタッフ一覧 */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          スタッフ（{staff?.length || 0}名）
        </h2>

        {staff && staff.length > 0 ? (
          <div className="divide-y divide-gray-800 mb-6">
            {staff.map((member) => (
              <div key={member.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-white">{member.display_name}</div>
                  <div className="text-xs text-gray-400">{member.email}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  member.role === 'admin'
                    ? 'bg-red-900 text-red-300'
                    : member.role === 'manager'
                    ? 'bg-orange-900 text-orange-300'
                    : 'bg-gray-800 text-gray-400'
                }`}>
                  {member.role}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 mb-6">スタッフが登録されていません</p>
        )}

        {/* スタッフ追加フォーム */}
        <AddStaffForm tenantId={tenant.id} />
      </div>
    </div>
  )
}
