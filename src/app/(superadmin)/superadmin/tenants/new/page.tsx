'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createTenant } from '@/actions/super-admin'

export default function NewTenantPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const form = new FormData(e.currentTarget)
    const result = await createTenant({
      slug: form.get('slug') as string,
      name: form.get('name') as string,
      display_name: form.get('display_name') as string,
      ancient_dealer_number: form.get('ancient_dealer_number') as string,
      plan: form.get('plan') as 'starter' | 'standard' | 'pro',
      primary_color: form.get('primary_color') as string,
    })

    setLoading(false)

    if (result.error) {
      setError(result.error)
      return
    }

    router.push(`/superadmin/tenants/${result.data?.id}`)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">新規テナント追加</h1>
        <p className="text-gray-400 mt-1">新しい買取店を登録します</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-gray-900 rounded-lg border border-gray-800 p-6 space-y-5">
        {error && (
          <div className="bg-red-900/50 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              店舗名 <span className="text-red-400">*</span>
            </label>
            <input
              name="name"
              required
              placeholder="クアドラ"
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              表示名 <span className="text-red-400">*</span>
            </label>
            <input
              name="display_name"
              required
              placeholder="クアドラ トレカ買取"
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Slug（サブドメイン識別子）<span className="text-red-400">*</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              name="slug"
              required
              pattern="[a-z0-9-]+"
              placeholder="quadra"
              className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            半角英数字とハイフンのみ。URLに使用されます（例: quadra.yourservice.jp）
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              プラン <span className="text-red-400">*</span>
            </label>
            <select
              name="plan"
              required
              defaultValue="standard"
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="starter">Starter（¥9,800/月）</option>
              <option value="standard">Standard（¥19,800/月）</option>
              <option value="pro">Pro（¥39,800/月）</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              テーマカラー
            </label>
            <input
              name="primary_color"
              type="color"
              defaultValue="#2563eb"
              className="w-full h-[38px] bg-gray-800 border border-gray-700 rounded-lg px-1 py-1 cursor-pointer"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            古物商許可番号
          </label>
          <input
            name="ancient_dealer_number"
            placeholder="第〇〇〇〇号"
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? '作成中...' : 'テナントを作成'}
          </button>
          <a
            href="/superadmin/tenants"
            className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            キャンセル
          </a>
        </div>
      </form>
    </div>
  )
}
