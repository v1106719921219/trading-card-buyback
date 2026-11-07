'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2, FileDown, FileText, Home, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BuySteps } from '@/components/pos/buy-steps'
import { getReceiptPdf, getStoreDocumentUrl } from '@/actions/pos-checkout'
import { formatDateTimeJst, formatYen, intakeNumberFromOrderNumber, sumAppraisal, type ReceiptHeader } from '@/lib/pos-buyback'
import type { Order, OrderItem } from '@/types/database'

const AUTO_RETURN_SECONDS = 30

/**
 * 完了（docs/pos/design.md 3.1 節 7）。買取明細書を 80mm 幅で画面表示し、PDF 保存・ブラウザ印刷ができる。
 * レシートプリンタへの送信は機材決定後に足す。一定時間で待機画面に戻る。
 * 取引履歴からの「再印刷」もこの画面を使う（autoReturn を切る）。
 */
export function DoneScreen({
  order,
  items,
  store,
  paidAt,
  identityLabel,
  staffName,
  autoReturn = true,
}: {
  order: Order
  items: OrderItem[]
  store: Required<ReceiptHeader>
  paidAt: string
  identityLabel: string
  staffName: string
  autoReturn?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [left, setLeft] = useState(AUTO_RETURN_SECONDS)
  const { count, total } = sumAppraisal(items)

  useEffect(() => {
    if (!autoReturn) return
    const t = setInterval(() => setLeft((s) => s - 1), 1000)
    return () => clearInterval(t)
  }, [autoReturn])
  useEffect(() => {
    if (autoReturn && left <= 0) router.push('/pos')
  }, [left, autoReturn, router])

  function downloadPdf() {
    startTransition(async () => {
      const res = await getReceiptPdf(order.id)
      if (res.error || !res.base64) {
        toast.error(res.error ?? 'PDF を作れませんでした')
        return
      }
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = res.filename ?? 'receipt.pdf'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    })
  }

  function openAgreement() {
    startTransition(async () => {
      const res = await getStoreDocumentUrl(order.id, 'agreement_pdf')
      if (res.error || !res.url) {
        toast.error(res.error ?? '申込書 PDF がありません')
        return
      }
      window.open(res.url, '_blank', 'noopener')
    })
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="print:hidden">
        <BuySteps current="完了" orderNumber={order.order_number} />
      </div>
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-4 lg:flex-row">
        <div className="flex-1 space-y-4 print:hidden">
          <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5">
            <div className="flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="h-6 w-6" />
              <h1 className="text-lg font-bold">買取が完了しました</h1>
            </div>
            <p className="mt-1 text-sm text-emerald-900">
              受付 {intakeNumberFromOrderNumber(order.order_number)} ・ {formatYen(total)} ・ {count} 点。古物台帳に記録しました。
            </p>
          </section>
          <section className="rounded-2xl border bg-card p-4">
            <h2 className="mb-3 font-bold">買取明細書（お客様控え）</h2>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => window.print()} className="h-11">
                <Printer className="h-4 w-4" />
                印刷
              </Button>
              <Button type="button" variant="outline" onClick={downloadPdf} disabled={pending} className="h-11">
                <FileDown className="h-4 w-4" />
                PDF 保存
              </Button>
              <Button type="button" variant="outline" onClick={openAgreement} disabled={pending} className="h-11">
                <FileText className="h-4 w-4" />
                申込書 PDF（店控え）
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">レシートプリンタへの直接送信は、機種が決まり次第ここに足します。</p>
          </section>
          <div className="flex items-center gap-3">
            <Button asChild className="h-12 px-6 text-base">
              <Link href="/pos">
                <Home className="h-4 w-4" />
                待機画面へ
              </Link>
            </Button>
            {autoReturn ? <span className="text-sm text-muted-foreground">{left} 秒後に自動で戻ります</span> : null}
          </div>
        </div>

        {/* 80mm 幅の明細プレビュー。印刷時はこれだけを出す */}
        <div className="print:absolute print:inset-0 print:bg-white">
          <div className="mx-auto w-[80mm] rounded border bg-white p-3 font-mono text-[11px] leading-snug text-black shadow-sm print:border-0 print:shadow-none">
            <div className="text-center">
              <div className="text-sm font-bold">{store.store_name}</div>
              {store.address ? <div>{store.address}</div> : null}
              {store.phone ? <div>TEL {store.phone}</div> : null}
              {store.license_number ? <div>古物商許可番号 {store.license_number}</div> : null}
              <div className="mt-2 text-sm font-bold">買取明細書</div>
            </div>
            <div className="mt-2">日時 {formatDateTimeJst(paidAt)}</div>
            <div>
              取引番号 {order.order_number}（受付 {intakeNumberFromOrderNumber(order.order_number)}）
            </div>
            <div>担当 {staffName}</div>
            <hr className="my-2 border-dashed border-black" />
            {items.map((i) => (
              <div key={i.id} className="mb-1">
                <div>
                  {i.product_name}
                  {i.condition_rank ? `（${i.condition_rank}）` : ''}
                </div>
                <div className="flex justify-between pl-2">
                  <span>
                    {i.quantity} × {formatYen(i.unit_price)}
                  </span>
                  <span>{formatYen(i.quantity * i.unit_price)}</span>
                </div>
              </div>
            ))}
            <hr className="my-2 border-dashed border-black" />
            <div className="flex items-end justify-between">
              <span>合計 {count} 点</span>
              <span className="text-base font-bold">{formatYen(total)}</span>
            </div>
            <div className="mt-2">支払方法 現金</div>
            <div>本人確認 済（{identityLabel}）</div>
            <p className="mt-3 text-[10px]">{store.notes}</p>
            <p className="text-[10px]">店頭買取はクーリングオフの対象外です。</p>
          </div>
        </div>
      </div>
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 2mm; }
          body * { visibility: hidden; }
          .print\\:absolute, .print\\:absolute * { visibility: visible; }
        }
      `}</style>
    </div>
  )
}
