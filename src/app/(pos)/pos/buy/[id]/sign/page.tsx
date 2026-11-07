import { redirect } from 'next/navigation'
import { getTenant } from '@/lib/tenant'
import { SignScreen } from '@/components/pos/sign-screen'
import { loadAgreement, loadBuybackOrder, loadIdentityCheck } from '../load'

export const dynamic = 'force-dynamic'

/** 申込書兼受領書への署名（docs/pos/design.md 4 章 #6） */
export default async function PosSignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { order, items } = await loadBuybackOrder(id)
  if (order.status === '申込') redirect(`/pos/buy/${id}/appraise`)
  if (order.status !== '検品完了') redirect(`/pos/buy/${id}`)
  const identity = await loadIdentityCheck(id)
  if (!identity) redirect(`/pos/buy/${id}/identity`)
  const [existing, tenant] = await Promise.all([loadAgreement(id), getTenant()])
  return <SignScreen order={order} items={items} identity={identity} storeName={tenant?.display_name || tenant?.name || ''} existing={existing} />
}
