import { redirect } from 'next/navigation'
import { getTenant } from '@/lib/tenant'
import { PayScreen } from '@/components/pos/pay-screen'
import { loadAgreement, loadBuybackOrder, loadIdentityCheck } from '../load'

export const dynamic = 'force-dynamic'

/** 現金支払い（docs/pos/design.md 4 章 #7） */
export default async function PosPayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { order, items } = await loadBuybackOrder(id)
  if (order.status === '申込') redirect(`/pos/buy/${id}/appraise`)
  if (order.status === '振込済' || order.status === '振込確認済') redirect(`/pos/buy/${id}/done`)
  if (order.status !== '検品完了') redirect(`/pos/buy/${id}`)
  const [identity, agreement, tenant] = await Promise.all([loadIdentityCheck(id), loadAgreement(id), getTenant()])
  if (!identity) redirect(`/pos/buy/${id}/identity`)
  if (!agreement) redirect(`/pos/buy/${id}/sign`)
  return <PayScreen order={order} items={items} approvalThreshold={tenant?.high_value_approval_threshold ?? null} />
}
