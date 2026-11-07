import { redirect } from 'next/navigation'
import { PresentScreen } from '@/components/pos/present-screen'
import { loadBuybackOrder } from '../load'

export const dynamic = 'force-dynamic'

/** 査定結果の提示（docs/pos/design.md 3.1 節 3） */
export default async function PosPresentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { order, items } = await loadBuybackOrder(id)
  // 査定確定前なら査定へ、支払済・取消なら受付の詳細へ
  if (order.status === '申込') redirect(`/pos/buy/${id}/appraise`)
  if (order.status !== '検品完了') redirect(`/pos/buy/${id}`)
  return <PresentScreen order={order} items={items} />
}
