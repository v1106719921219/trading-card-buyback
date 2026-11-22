'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2, Home, Minus, Plus, Printer, ShoppingCart, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { returnSaleItems } from '@/actions/pos-sales'
import { buildReturnLines, includedTax } from '@/lib/pos-sales'
import { formatDateTimeJst, formatYen } from '@/lib/pos-buyback'
import type { Sale, SaleItem, SaleReturn } from '@/types/database'

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
 * 返品もここから行う。商品ごとに数量を選んで返金し、在庫に戻す。すべて返品すると取消になる。
 */
export function SaleReceiptScreen({
  sale,
  items,
  returns,
  store,
  justDone,
}: {
  sale: Sale
  items: SaleItem[]
  returns: SaleReturn[]
  store: SaleReceiptStore
  justDone: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [left, setLeft] = useState(AUTO_RETURN_SECONDS)
  const [returning, setReturning] = useState(false)
  /** 明細 ID → 返品する数量 */
  const [selection, setSelection] = useState<Record<string, number>>({})
  const [reason, setReason] = useState('')
  const autoReturn = justDone && !returning && !sale.voided_at
  const count = items.reduce((s, i) => s + i.quantity, 0)
  const refunded = sale.refunded_total ?? 0
  const net = sale.total - refunded
  const returnable = items.filter((i) => i.quantity > (i.returned_quantity ?? 0))
  const plan = buildReturnLines(items, selection)
  const selectedCount = plan.ok ? plan.count : 0
  const selectedRefund = plan.ok ? plan.refund : 0
  const allSelected = returnable.length > 0 && returnable.every((i) => (selection[i.id] ?? 0) === i.quantity - (i.returned_quantity ?? 0))

  useEffect(() => {
    if (!autoReturn) return
    const t = setInterval(() => setLeft((s) => s - 1), 1000)
    return () => clearInterval(t)
  }, [autoReturn])
  useEffect(() => {
    if (autoReturn && left <= 0) router.push('/pos/standby')
  }, [left, autoReturn, router])

  function setQty(item: SaleItem, qty: number) {
    const max = item.quantity - (item.returned_quantity ?? 0)
    setSelection((cur) => ({ ...cur, [item.id]: Math.max(0, Math.min(max, qty)) }))
  }

  function selectAll() {
    setSelection(allSelected ? {} : Object.fromEntries(returnable.map((i) => [i.id, i.quantity - (i.returned_quantity ?? 0)])))
  }

  function doReturn() {
    if (!plan.ok) return toast.error(plan.error)
    if (!reason.trim()) return toast.error('返品の理由を入力してください')
    startTransition(async () => {
      const res = await returnSaleItems({ saleId: sale.id, lines: plan.lines, reason })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`${res.fullyReturned ? '取り消しました' : '返品を記録しました'}。${formatYen(res.refunded ?? plan.refund)} を返金してください`)
      setReturning(false)
      setSelection({})
      setReason('')
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
{formatDateTimeJst(sale.voided_at)} ・ {sale.voided_by_name ?? ''} ・ 理由: {sale.void_reason} ・ 返金の合計 {formatYen(refunded)}。商品は在庫に戻しました。
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
                {refunded > 0 ? <div className="text-xs">返金 {formatYen(refunded)} ・ 返品後 {formatYen(net)}</div> : null}
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
            {returnable.length > 0 && !returning ? (
              <Button type="button" variant="outline" onClick={() => setReturning(true)} className="h-11">
                <Undo2 className="h-4 w-4" />
                返品・取消（返金）
              </Button>
            ) : null}
          </div>
          {returning ? (
            <div className="mt-3 space-y-3 rounded-xl border border-red-200 bg-red-50 p-3 text-red-950">
              <div className="flex flex-wrap items-center gap-3">
                <p className="mr-auto text-sm">返品する商品と数量を選んでください。選んだ分を返金し、在庫に戻します。</p>
                <Button type="button" variant="outline" onClick={selectAll} disabled={pending} className="h-10 bg-white">
                  {allSelected ? '選択を外す' : 'すべて選ぶ（取消）'}
                </Button>
              </div>
              <ul className="divide-y divide-red-200 rounded-lg bg-white">
                {returnable.map((i) => {
                  const max = i.quantity - (i.returned_quantity ?? 0)
                  const qty = selection[i.id] ?? 0
                  return (
                    <li key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                      <div className="min-w-[160px] flex-1">
                        <div className="font-medium">{i.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatYen(i.unit_price)} ・ 返品できる数 {max}
                          {(i.returned_quantity ?? 0) > 0 ? `（返品済み ${i.returned_quantity}）` : ''}
                        </div>
                      </div>
                      {max === 1 ? (
                        <label className="flex h-11 items-center gap-2 text-sm">
                          <input type="checkbox" checked={qty === 1} onChange={(e) => setQty(i, e.target.checked ? 1 : 0)} disabled={pending} className="h-6 w-6" />
                          返品する
                        </label>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button type="button" variant="outline" size="icon" onClick={() => setQty(i, qty - 1)} disabled={pending || qty === 0} className="h-11 w-11" aria-label={`${i.name} の返品数を減らす`}>
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-12 text-center text-lg font-bold tabular-nums">{qty}</span>
                          <Button type="button" variant="outline" size="icon" onClick={() => setQty(i, qty + 1)} disabled={pending || qty === max} className="h-11 w-11" aria-label={`${i.name} の返品数を増やす`}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      <span className="w-24 text-right tabular-nums">{qty > 0 ? `−${formatYen(qty * i.unit_price)}` : ''}</span>
                    </li>
                  )
                })}
              </ul>
              <div className="flex items-center justify-between">
                <span className="text-sm">返金する金額（{selectedCount} 点）</span>
                <span className="text-2xl font-bold tabular-nums">{formatYen(selectedRefund)}</span>
              </div>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="理由（例: 打ち間違い、お客様都合の返品、初期傷）" className="h-11 bg-white" />
              <div className="flex gap-2">
                <Button type="button" variant="destructive" onClick={doReturn} disabled={pending || selectedCount === 0} className="h-11">
                  {allSelected ? '取り消して返金する' : '返品して返金する'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setReturning(false)} disabled={pending} className="h-11">
                  やめる
                </Button>
              </div>
              <p className="text-xs">返金は開局中のレジの現金から出します。レジ締めの理論残高に反映されます。</p>
            </div>
          ) : null}
          {returns.length > 0 ? (
            <div className="mt-3">
              <h3 className="mb-1 text-sm font-bold">返品の記録</h3>
              <ul className="divide-y text-sm">
                {returns.map((r) => (
                  <li key={r.id} className="py-1.5">
                    <div className="flex flex-wrap items-center gap-x-3">
                      <span className="text-xs text-muted-foreground">{formatDateTimeJst(r.created_at)}</span>
                      <span className="text-xs text-muted-foreground">{r.returned_by_name ?? ''}</span>
                      <span className="ml-auto tabular-nums">返金 {formatYen(r.amount)}</span>
                    </div>
                    <div>{r.lines.map((l) => `${l.name} × ${l.quantity}`).join('、')}</div>
                    <div className="text-xs text-muted-foreground">理由: {r.reason}</div>
                  </li>
                ))}
              </ul>
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
            <div className="mt-2 text-sm font-bold">{sale.voided_at ? '領収証（取消済み）' : refunded > 0 ? '領収証（一部返品）' : '領収証'}</div>
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
              {(i.returned_quantity ?? 0) > 0 ? (
                <div className="flex justify-between pl-2">
                  <span>返品 {i.returned_quantity} 点</span>
                  <span>−{formatYen((i.returned_quantity ?? 0) * i.unit_price)}</span>
                </div>
              ) : null}
            </div>
          ))}
          <hr className="my-2 border-dashed border-black" />
          <div className="flex items-end justify-between">
            <span>合計 {count} 点</span>
            <span className="text-base font-bold">{formatYen(sale.total)}</span>
          </div>
          {refunded > 0 ? (
            <>
              <div className="flex justify-between">
                <span>返金</span>
                <span>−{formatYen(refunded)}</span>
              </div>
              <div className="flex items-end justify-between">
                <span>返品後の合計</span>
                <span className="text-base font-bold">{formatYen(net)}</span>
              </div>
            </>
          ) : null}
          <div className="flex justify-between">
            <span>（10% 対象 {formatYen(net)}）</span>
            <span>内消費税 {formatYen(refunded > 0 ? includedTax(net) : sale.tax_amount)}</span>
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
