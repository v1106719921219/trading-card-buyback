'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Banknote, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { BuySteps } from '@/components/pos/buy-steps'
import { SummaryPane } from '@/components/pos/summary-pane'
import { recordStoreCashPayment } from '@/actions/pos-checkout'
import { formatYen, intakeNumberFromOrderNumber, sumAppraisal } from '@/lib/pos-buyback'
import type { Order, OrderItem } from '@/types/database'

/**
 * 現金支払い（docs/pos/design.md 4 章 #7、3.1 節 6）。
 * 支払額を大きく出し、スタッフが金庫から数えて渡し、スタッフが記録する（店舗は staff で運用）。
 * 一定額以上は承認ラインの案内を出す（金額は設定。遠隔の管理者による承認手順は未実装で、監査ログに高額の印だけ残す）。
 */
export function PayScreen({
  order,
  items,
  approvalThreshold,
}: {
  order: Order
  items: OrderItem[]
  approvalThreshold: number | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [counted, setCounted] = useState(false)
  const { count, total } = sumAppraisal(items)
  const amount = (order.inspected_total_amount ?? total) - (order.inspection_discount ?? 0)
  // 同じ内容での再送は同じ ID を使い、二重登録を防ぐ（record_order_payment は同じ ID なら重複登録しない）
  const request = useRef<{ key: string; id: string } | null>(null)
  const highValue = approvalThreshold !== null && amount >= approvalThreshold

  function submit() {
    const key = `${order.id}:${amount}:${order.updated_at}`
    if (!request.current || request.current.key !== key) request.current = { key, id: crypto.randomUUID() }
    const requestId = request.current.id
    startTransition(async () => {
      const res = await recordStoreCashPayment(order.id, order.updated_at, requestId)
      if (res.error) {
        toast.error(res.error)
        if (res.amount) router.push(`/pos/buy/${order.id}/done`)
        return
      }
      toast.success(`${formatYen(res.amount ?? amount)} の支払いを記録しました`)
      router.push(`/pos/buy/${order.id}/done`)
    })
  }

  return (
    <div className="flex flex-1 flex-col">
      <BuySteps current="支払い" orderNumber={order.order_number} />
      <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[1fr_minmax(300px,34%)]">
        <div className="flex flex-col gap-4">
          <section className="rounded-2xl border bg-card px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">お渡しする現金（{count} 点）</p>
            <p className="mt-2 text-6xl font-bold tabular-nums">{formatYen(amount)}</p>
            <p className="mt-4 text-sm text-muted-foreground">金庫から数えてお渡しください。キャッシュドロワーは使いません。</p>
          </section>

          {highValue ? (
            <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm">
              <ShieldCheck className="mr-1 inline h-4 w-4 text-amber-700" />
              高額取引（{formatYen(approvalThreshold!)} 以上）です。記録する前に管理者へ連絡し、内容を確認してもらってください。
            </section>
          ) : null}

          <section className="rounded-2xl border bg-card p-4">
            <label className="flex items-start gap-3 text-sm">
              <Checkbox checked={counted} onCheckedChange={(v) => setCounted(v === true)} className="mt-0.5" />
              <span>
                現金 {formatYen(amount)} を数えてお客様にお渡しし、受け取りを確認しました。
                <span className="block text-xs text-muted-foreground">受領の署名は申込書の署名を兼ねます。</span>
              </span>
            </label>
          </section>
        </div>
        <div className="min-h-[280px]">
          <SummaryPane items={items} customerLabel={`受付 ${intakeNumberFromOrderNumber(order.order_number)} ・ ${order.customer_name} 様`} />
        </div>
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-card px-4 py-3">
        <Button asChild variant="ghost">
          <Link href={`/pos/buy/${order.id}/sign`}>
            <ArrowLeft className="h-4 w-4" />
            署名に戻る
          </Link>
        </Button>
        <Button type="button" onClick={submit} disabled={pending || !counted} className="h-12 px-6 text-base">
          <Banknote className="h-4 w-4" />
          支払いを記録して完了
        </Button>
      </div>
    </div>
  )
}
