'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toggleTenantActive, updateTenant } from '@/actions/super-admin'

interface Tenant {
  id: string
  is_active: boolean
  plan: string
  name: string
}

export function TenantActions({ tenant }: { tenant: Tenant }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleToggleActive() {
    if (!confirm(`テナント「${tenant.name}」を${tenant.is_active ? '停止' : '有効化'}しますか？`)) return
    setLoading(true)
    await toggleTenantActive(tenant.id, !tenant.is_active)
    setLoading(false)
    router.refresh()
  }

  async function handleChangePlan(plan: string) {
    setLoading(true)
    await updateTenant(tenant.id, { plan: plan as 'starter' | 'standard' | 'pro' })
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-3 mt-6 pt-6 border-t border-gray-800">
      <button
        onClick={handleToggleActive}
        disabled={loading}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
          tenant.is_active
            ? 'bg-red-900 hover:bg-red-800 text-red-300'
            : 'bg-green-900 hover:bg-green-800 text-green-300'
        }`}
      >
        {tenant.is_active ? 'テナントを停止' : 'テナントを有効化'}
      </button>

      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">プラン変更:</span>
        <select
          value={tenant.plan}
          onChange={(e) => handleChangePlan(e.target.value)}
          disabled={loading}
          className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
        >
          <option value="starter">Starter</option>
          <option value="standard">Standard</option>
          <option value="pro">Pro</option>
        </select>
      </div>
    </div>
  )
}
