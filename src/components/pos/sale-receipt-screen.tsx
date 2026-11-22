'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2, Home, Printer, ShoppingCart, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { voidSale } from '@/actions/pos-sales'
import { formatDateTimeJst, formatYen } from '@/lib/pos-buyback'
import type { Sale, SaleItem } from '@/types/database'

const AUTO_RETURN_SECONDS = 30

export interface SaleReceiptStore {
  store_name: string
  address: string
  phone: string
  invoice_number: string
}

/**
 * 販売の完了・詳細（docs/pos/design.md 3.2 節、8 章 販売レシート）。
 * レシートを 80mm 幅で表示してブラウザ印刷できる。会計直後は一定時間で待機画面に戻る。
 * 取消（全額返金・在庫に戻す）もここから行う。
 */
export function SaleReceiptScreen({ sale, items, store, justDone }: { sale: Sale; items: SaleItem[]; store: SaleReceiptStore; justDone: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [left, setLeft] = useState(AUTO_RETURN_SECONDS)
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  const autoReturn = justDone && !voiding && !sale.voided_at
  const count = items.reduce((s, i) => s + i.quantity, 0)

  useEffect(() => {
    if (!autoReturn) return
    const t = setInterval(() => setLeft((s) => s - 1), 1000)
    return () => clearInterval(t)
  }, [autoReturn])
  useEffect(() => {
    if (autoReturn && left <= 0) router.push('/pos/standby')
  }, [left, autoReturn, router])

  function doVoid() {
    if (!reason.trim()) return toast.error('取消の理由を入力してください')
    startTransition(async () => {
      const res = await voidSale(sale.id, reason)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`取り消しました。${formatYen(res.refunded ?? sale.total)} を返金してください`)
      setVoiding(false)
      router.replace(`/pos/sell/${sale.id}`)
      router.refresh()
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-4 lg:flex-row">
      <div className="flex-1 space-y-4 print:hidden">
        {sale.voided_at ? (
          <section className="rounded-2xl border border-red-300 bg-red-50 p-5 text-red-900">
            <h1 className="text-lg font-bold">この販売は取消済みです</h1>
            <p className="mt-1 text-sm">
              {formatDateTimeJst(sale.voided_at)} ・ {sale.voided_by_name ?? ''} ・ 理由: {sale.void_reason} ・ 返金 {formatYen(sale.total)}。商品は在庫に戻しました。
            </p>
          </section>
        ) : (
          <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5">
            <div className="flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="h-6 w-6" />
              <h1 className="text-lg font-bold">{justDone ? '会計が完了しました' : `販売 ${sale.sale_number}`}</h1>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-emerald-900">
              <div>
                <div className="text-xs">合計（{count} 点）</div>
                <div className="text-2xl font-bold tabular-nums">{formatYen(sale.total)}</div>
              </div>
              <div>
                <div className="text-xs">預り金</div>
                <div className="text-2xl font-bold tabular-nums">{formatYen(sale.tendered)}</div>
              </div>
              <div>
                <div className="text-xs">おつり</div>
                <div className="text-4xl font-bold tabular-nums">{formatYen(sale.change_due)}</div>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-2xl border bg-card p-4">
          <h2 className="mb-3 font-bold">レシート</h2>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => window.print()} className="h-11">
              <Printer className="h-4 w-4" />
              印刷
            </Button>
            {!sale.voided_at && !voiding ? (
              <Button type="button" variant="outline" onClick={() => setVoiding(true)} className="h-11">
                <Undo2 className="h-4 w-4" />
                取消（返金）
              </Button>
            ) : null}
          </div>
          {voiding ? (
            <div className="mt-3 space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-900">
                全額 {formatYen(sale.total)} を返金し、商品を在庫に戻します。一部だけの返品はできません（取り消してから、残す分を会計し直してください）。
              </p>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="理由（例: 打ち間違い、お客様都合の返品）" className="h-11 bg-white" />
              <div className="flex gap-2">
                <Button type="button" variant="destructive" onClick={doVoid} disabled={pending} className="h-11">
                  取り消して返金する
                </Button>
                <Button type="button" variant="ghost" onClick={() => setVoiding(false)} disabled={pending} className="h-11">
                  やめる
                </Button>
              </div>
            </div>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">レシートプリンタへの直接送信は、機種が決まり次第ここに足します。</p>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Button asChild className="h-12 px-6 text-base">
            <Link href="/pos/sell">
              <ShoppingCart className="h-4 w-4" />
              次の販売へ
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-12 px-6 text-base">
            <Link href="/pos/standby">
              <Home className="h-4 w-4" />
              待機画面へ
            </Link>
          </Button>
          {autoReturn ? <span className="text-sm text-muted-foreground">{left} 秒後に待機画面へ戻ります</span> : null}
        </div>
      </div>

      {/* 80mm 幅のレシート。印刷時はこれだけを出す */}
      <div className="print:absolute print:inset-0 print:bg-white">
        <div className="mx-auto w-[80mm] rounded border bg-white p-3 font-mono text-[11px] leading-snug text-black shadow-sm print:border-0 print:shadow-none">
          <div className="text-center">
            <div className="text-sm font-bold">{store.store_name}</div>
            {store.address ? <div>{store.address}</div> : null}
            {store.phone ? <div>TEL {store.phone}</div> : null}
            {store.invoice_number ? <div>登録番号 {store.invoice_number}</div> : null}
            <div className="mt-2 text-sm font-bold">{sale.voided_at ? '領収証（取消済み）' : '領収証'}</div>
          </div>
          <div className="mt-2">日時 {formatDateTimeJst(sale.created_at)}</div>
          <div>取引番号 {sale.sale_number}</div>
          {sale.sold_by_name ? <div>担当 {sale.sold_by_name}</div> : null}
          <hr className="my-2 border-dashed border-black" />
          {items.map((i) => (
            <div key={i.id} className="mb-1">
              <div>{i.name}</div>
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
            <span className="text-base font-bold">{formatYen(sale.total)}</span>
          </div>
          <div className="flex justify-between">
            <span>（10% 対象 {formatYen(sale.total)}）</span>
            <span>内消費税 {formatYen(sale.tax_amount)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>お預り</span>
            <span>{formatYen(sale.tendered)}</span>
          </div>
          <div className="flex justify-between">
            <span>おつり</span>
            <span>{formatYen(sale.change_due)}</span>
          </div>
          <div className="mt-1">支払方法 現金</div>
          <p className="mt-3 text-[10px]">価格はすべて税込です。</p>
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
