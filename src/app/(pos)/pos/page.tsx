import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/actions/auth'
import { getTenant } from '@/lib/tenant'
import { getCurrentOperatorName } from '@/lib/pos-operator'
import { posLandingPath } from '@/lib/store-mode'

export const dynamic = 'force-dynamic'

/**
 * POS の入口。画面は持たず、権限で行き先を振り分ける（2026-11-22 決定）。
 * 管理者・マネージャーはダッシュボード（本日の状況）、スタッフはレジ開局画面（開局済みなら待機画面）。
 * ログイン直後、ホーム画面のアイコンからの起動、店舗 URL のトップ・/admin への来訪はすべてここを通る。
 */
export default async function PosEntryPage() {
  const [user, tenant] = await Promise.all([getCurrentUser(), getTenant()])
  if (!user || !tenant) redirect('/login?redirect=/pos')
  const registerOpen = (await getCurrentOperatorName(tenant.id)) !== null
  redirect(posLandingPath(user.role, registerOpen))
}
