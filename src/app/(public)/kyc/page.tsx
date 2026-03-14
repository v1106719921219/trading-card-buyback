import { getTenant } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import { KycFlow } from './kyc-flow'

export default async function KycPage() {
  const tenant = await getTenant()

  if (!tenant) {
    redirect('/')
  }

  // eKYC機能が無効なテナントはトップにリダイレクト
  if (!tenant.ekyc_enabled) {
    redirect('/')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">本人確認（eKYC）</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            古物営業法に基づく本人確認を行います
          </p>
        </div>
        <KycFlow />
      </div>
    </div>
  )
}
