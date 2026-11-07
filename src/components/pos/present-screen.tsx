'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, DoorOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { BuySteps } from '@/components/pos/buy-steps'
import { SummaryPane } from '@/components/pos/summary-pane'
import { reopenAppraisal, walkAwayAppraisal } from '@/actions/pos-buyback'
import { formatYen, intakeNumberFromOrderNumber, sumAppraisal } from '@/lib/pos-buyback'
import type { Order, OrderItem } from '@/types/database'

/**
 * 査定結果の提示（docs/pos/design.md 3.1 節 3）。
 * お客様に画面を向けて合計を見せる。「持ち帰る」は査定のみで終了（記録は残す）。
 */
export function PresentScreen({ order, items }: { order: Order; items: OrderItem[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [walkOpen, setWalkOpen] = useState(false)
  const [walkNote, setWalkNote] = useState('')
  const { count, total } = sumAppraisal(items)

  function back() {
    startTransition(async () => {
      const res = await reopenAppraisal(order.id)
      if (res.error) {
        toast.error(res.error)
        return
      }
      router.push(`/pos/buy/${order.id}/appraise`)
    })
  }

  function walkAway() {
    startTransition(async () => {
      const res = await walkAwayAppraisal(order.id, walkNote)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('査定のみで終了しました（記録は残ります）')
      router.push('/pos')
    })
  }

  return (
    <div className="flex flex-1 flex-col">
      <BuySteps current="提示" orderNumber={order.order_number} />
      <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[1fr_minmax(320px,38%)]">
        <div className="flex flex-col gap-4">
          <section className="rounded-2xl border bg-card px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">買取合計（{count} 点）</p>
            <p className="mt-2 text-6xl font-bold tabular-nums">{formatYen(total)}</p>
            <p className="mt-4 text-sm text-muted-foreground">お客様にこの画面を向けて金額を確認してもらいます</p>
          </section>
          <section className="rounded-2xl border bg-card p-4 text-sm">
            <h2 className="mb-1 font-bold">この金額で進める場合</h2>
            <p className="text-muted-foreground">
              本人確認 → 申込書への署名 → 現金のお渡し、の順です。署名は 1 回で、査定額への同意・誓約・受領を兼ねます。
            </p>
          </section>
        </div>
        <div className="min-h-[320px]">
          <SummaryPane items={items} customerLabel={`受付 ${intakeNumberFromOrderNumber(order.order_number)} ・ ${order.customer_name} 様`} />
        </div>
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-card px-4 py-3">
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={back} disabled={pending}>
            <ArrowLeft className="h-4 w-4" />
            査定に戻る
          </Button>
          <Button type="button" variant="outline" onClick={() => setWalkOpen(true)} disabled={pending} className="text-destructive">
            <DoorOpen className="h-4 w-4" />
            持ち帰る（査定のみで終了）
          </Button>
        </div>
        <Button type="button" onClick={() => router.push(`/pos/buy/${order.id}/identity`)} disabled={pending} className="h-12 px-6 text-base">
          同意して本人確認へ
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <AlertDialog open={walkOpen} onOpenChange={setWalkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>査定のみで終了しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              査定の記録は残りますが、支払い・在庫・台帳には進みません。再来店時に取引履歴から呼び出せます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={walkNote} onChange={(e) => setWalkNote(e.target.value)} placeholder="メモ（任意。例: 他店と比較したい）" />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>戻る</AlertDialogCancel>
            <AlertDialogAction onClick={walkAway} disabled={pending}>
              終了する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
