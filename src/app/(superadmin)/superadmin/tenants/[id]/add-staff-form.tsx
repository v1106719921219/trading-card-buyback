'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createTenantAdmin } from '@/actions/super-admin'

export function AddStaffForm({ tenantId }: { tenantId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    const form = new FormData(e.currentTarget)
    const result = await createTenantAdmin(tenantId, {
      email: form.get('email') as string,
      password: form.get('password') as string,
      display_name: form.get('display_name') as string,
    })

    setLoading(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setSuccess(true)
    setOpen(false)
    router.refresh()
    ;(e.target as HTMLFormElement).reset()
  }

  if (!open) {
    return (
      <div>
        {success && (
          <div className="text-sm text-green-400 mb-3">✅ 管理者アカウントを作成しました</div>
        )}
        <button
          onClick={() => setOpen(true)}
          className="px-4 py-2 bg-blue-900 hover:bg-blue-800 text-blue-300 rounded-lg text-sm font-medium transition-colors"
        >
          + 管理者アカウントを追加
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-white">管理者アカウント追加</h3>

      {error && (
        <div className="text-sm text-red-400 bg-red-950 border border-red-800 px-3 py-2 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">表示名</label>
          <input
            name="display_name"
            required
            placeholder="田中 太郎"
            className="w-full bg-gray-900 border border-gray-700 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">メールアドレス</label>
          <input
            name="email"
            type="email"
            required
            placeholder="admin@example.com"
            className="w-full bg-gray-900 border border-gray-700 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">初期パスワード</label>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="8文字以上"
          className="w-full bg-gray-900 border border-gray-700 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors"
        >
          {loading ? '作成中...' : '作成'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null) }}
          className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm font-medium transition-colors"
        >
          キャンセル
        </button>
      </div>
    </form>
  )
}
