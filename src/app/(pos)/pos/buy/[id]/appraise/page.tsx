import { redirect } from 'next/navigation'
import { getAppraisalMasters } from '@/actions/pos-buyback'
import { AppraiseScreen } from '@/components/pos/appraise-screen'
import { loadBuybackOrder } from '../load'

export const dynamic = 'force-dynamic'

/** 査定（docs/pos/design.md 4 章 #4） */
export default async function PosAppraisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { order, items } = await loadBuybackOrder(id)
  // 支払済・取消の受付は査定画面を出さない
  if (order.status !== '申込' && order.status !== '検品完了') redirect(`/pos/buy/${id}`)
  const masters = await getAppraisalMasters()
  return <AppraiseScreen order={order} items={items} ranks={masters.ranks ?? []} bands={masters.bands ?? []} />
}
