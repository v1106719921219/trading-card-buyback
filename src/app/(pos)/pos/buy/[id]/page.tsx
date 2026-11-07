import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { SummaryPane } from '@/components/pos/summary-pane'
import { DoneScreen } from '@/components/pos/done-screen'
import { getTenant } from '@/lib/tenant'
import { POS_STATUS_LABELS, identityMethodLabel, intakeNumberFromOrderNumber, resolveReceiptHeader } from '@/lib/pos-buyback'
import { loadBuybackOrder, loadIdentityCheck, loadLatestPayment } from './load'

export const dynamic = 'force-dynamic'

/**
 * 受付の詳細。進行中なら今の段階の画面へ送る。
 * 支払済は明細書の再表示（再印刷）、持ち帰り・取消は明細を読み取り専用で見せる。
 * 取引履歴（4 章 #12）ができるまでの入口。
 */
export default async function PosBuybackOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { order, items } = await loadBuybackOrder(id)
  if (order.status === '申込') redirect(`/pos/buy/${id}/appraise`)
  if (order.status === '検品完了') redirect(`/pos/buy/${id}/present`)
  if (order.status === '振込済' || order.status === '振込確認済') {
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
        autoReturn={false}
      />
    )
  }
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold">受付 {intakeNumberFromOrderNumber(order.order_number)}</h1>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{POS_STATUS_LABELS[order.status] ?? order.status}</span>
        <span className="ml-auto font-mono text-xs text-muted-foreground">{order.order_number}</span>
      </div>
      <div className="min-h-[320px]">
        <SummaryPane items={items} customerLabel={`${order.customer_name} 様`} />
      </div>
      {order.notes ? <pre className="whitespace-pre-wrap rounded-xl border bg-card p-3 text-xs text-muted-foreground">{order.notes}</pre> : null}
      <div>
        <Button asChild variant="outline">
          <Link href="/pos/buy">受付へ</Link>
        </Button>
      </div>
    </div>
  )
}
