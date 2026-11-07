import { redirect } from 'next/navigation'
import { IdentityScreen } from '@/components/pos/identity-screen'
import { loadBuybackOrder, loadIdentityCheck } from '../load'
import type { StoreCustomer } from '@/types/database'

export const dynamic = 'force-dynamic'

/** 本人確認（docs/pos/design.md 4 章 #5） */
export default async function PosIdentityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { order, items } = await loadBuybackOrder(id)
  if (order.status === '申込') redirect(`/pos/buy/${id}/appraise`)
  if (order.status !== '検品完了') redirect(`/pos/buy/${id}`)
  const existing = await loadIdentityCheck(id)
  const customer = ((order as unknown as { store_customer?: StoreCustomer | null }).store_customer ?? null) as StoreCustomer | null
  return <IdentityScreen order={order} items={items} customer={customer} existing={existing} />
}
