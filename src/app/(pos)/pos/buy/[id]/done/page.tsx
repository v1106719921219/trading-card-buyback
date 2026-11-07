import { redirect } from 'next/navigation'
import { getTenant } from '@/lib/tenant'
import { DoneScreen } from '@/components/pos/done-screen'
import { identityMethodLabel, resolveReceiptHeader } from '@/lib/pos-buyback'
import { loadBuybackOrder, loadIdentityCheck, loadLatestPayment } from '../load'

export const dynamic = 'force-dynamic'

/** 完了・買取明細書（docs/pos/design.md 3.1 節 7、8 章） */
export default async function PosDonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { order, items } = await loadBuybackOrder(id)
  if (order.status !== '振込済' && order.status !== '振込確認済') redirect(`/pos/buy/${id}`)
  const [tenant, identity, payment] = await Promise.all([getTenant(), loadIdentityCheck(id), loadLatestPayment(id)])
  if (!tenant) redirect('/pos')
  return (
    <DoneScreen
      order={order}
      items={items}
      store={resolveReceiptHeader(tenant)}
      paidAt={payment?.created_at ?? order.updated_at}
      identityLabel={identity ? identityMethodLabel(identity.method, identity.document_type) : (order.customer_identity_method ?? '確認済み')}
      staffName={order.inspected_by_name ?? ''}
    />
  )
}
