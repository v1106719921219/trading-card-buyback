'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BuySteps } from '@/components/pos/buy-steps'
import { SignaturePad } from '@/components/admin/signature-pad'
import { getStoreDocumentUrl, signAgreement } from '@/actions/pos-checkout'
import { AGREEMENT_TEMPLATE, formatYen, identityMethodLabel, intakeNumberFromOrderNumber, sumAppraisal } from '@/lib/pos-buyback'
import type { Order, OrderItem, StoreAgreement, StoreIdentityCheck } from '@/types/database'

/**
 * 申込書兼受領書への署名（docs/pos/design.md 4 章 #6、3.1 節 5）。
 * 明細・合計・誓約事項・個人情報の利用目的・本人確認の内容を 1 画面に出し、署名してもらう。
 * 署名は 1 回で「査定額への同意」「誓約」「現金の受領」を兼ねる。
 */
export function SignScreen({
  order,
  items,
  identity,
  storeName,
  existing,
}: {
  order: Order
  items: OrderItem[]
  identity: StoreIdentityCheck
  storeName: string
  existing: StoreAgreement | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [signature, setSignature] = useState<string | null>(null)
  const { count, total } = sumAppraisal(items)

  function submit() {
    if (!signature) {
      toast.error('署名してください')
      return
    }
    startTransition(async () => {
      const res = await signAgreement(order.id, signature)
      if (res.error) {
        toast.error(res.error)
        return
      }
      router.push(`/pos/buy/${order.id}/pay`)
    })
  }

  function openPdf() {
    startTransition(async () => {
      const res = await getStoreDocumentUrl(order.id, 'agreement_pdf')
      if (res.error || !res.url) {
        toast.error(res.error ?? 'PDF がありません')
        return
      }
      window.open(res.url, '_blank', 'noopener')
    })
  }

  return (
    <div className="flex flex-1 flex-col">
      <BuySteps current="署名" orderNumber={order.order_number} />
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
        <article className="rounded-2xl border bg-card p-5 text-sm leading-relaxed">
          <h1 className="text-center text-lg font-bold">{AGREEMENT_TEMPLATE.title}</h1>
          <p className="mt-1 text-center text-xs text-muted-foreground">
            {storeName} ・ 受付 {intakeNumberFromOrderNumber(order.order_number)}（{order.order_number}）
          </p>

          <h2 className="mt-5 font-bold">売渡人</h2>
          <dl className="mt-1 grid grid-cols-[6em_1fr] gap-y-1">
            <dt className="text-muted-foreground">氏名</dt>
            <dd>{identity.name}</dd>
            <dt className="text-muted-foreground">住所</dt>
            <dd>{identity.address}</dd>
            <dt className="text-muted-foreground">生年月日</dt>
            <dd>
              {identity.birth_date}（{identity.age_at_check} 歳）
            </dd>
            <dt className="text-muted-foreground">職業</dt>
            <dd>{identity.occupation}</dd>
            <dt className="text-muted-foreground">本人確認</dt>
            <dd>{identityMethodLabel(identity.method, identity.document_type)}</dd>
          </dl>

          <h2 className="mt-5 font-bold">売渡品目</h2>
          <table className="mt-1 w-full">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1 text-left font-normal">品名</th>
                <th className="py-1 text-right font-normal">数量</th>
                <th className="py-1 text-right font-normal">単価</th>
                <th className="py-1 text-right font-normal">金額</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-t">
                  <td className="py-1">
                    {i.product_name}
                    {i.condition_rank ? <span className="ml-1 text-xs text-muted-foreground">（{i.condition_rank}）</span> : null}
                  </td>
                  <td className="py-1 text-right tabular-nums">{i.quantity}</td>
                  <td className="py-1 text-right tabular-nums">{formatYen(i.unit_price)}</td>
                  <td className="py-1 text-right tabular-nums">{formatYen(i.unit_price * i.quantity)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-bold">
                <td className="py-2">合計 {count} 点</td>
                <td colSpan={3} className="py-2 text-right text-lg tabular-nums">
                  {formatYen(total)}
                </td>
              </tr>
            </tfoot>
          </table>

          <h2 className="mt-5 font-bold">誓約事項</h2>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            {AGREEMENT_TEMPLATE.pledges.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>

          <h2 className="mt-5 font-bold">個人情報の利用目的</h2>
          <p className="mt-1">{AGREEMENT_TEMPLATE.privacy}</p>
        </article>

        {existing ? (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm">
            <span>署名済みです（{new Date(existing.signed_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}）。そのまま支払いに進めます。</span>
            <Button type="button" variant="outline" size="sm" onClick={openPdf} disabled={pending || !existing.pdf_path}>
              <FileText className="h-4 w-4" />
              申込書 PDF を開く
            </Button>
          </section>
        ) : (
          <section className="rounded-2xl border bg-card p-4">
            <h2 className="mb-1 font-bold">売渡人 署名</h2>
            <p className="mb-3 text-xs text-muted-foreground">上記の内容に同意し、売却を申し込むとともに、買取代金を現金で受領したことの署名です。iPad をお客様に向けて、指かペンで署名してもらってください。</p>
            <SignaturePad onChange={setSignature} disabled={pending} />
          </section>
        )}
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-card px-4 py-3">
        <Button asChild variant="ghost">
          <Link href={`/pos/buy/${order.id}/identity`}>
            <ArrowLeft className="h-4 w-4" />
            本人確認に戻る
          </Link>
        </Button>
        {existing ? (
          <Button asChild className="h-12 px-6 text-base">
            <Link href={`/pos/buy/${order.id}/pay`}>
              現金支払いへ
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button type="button" onClick={submit} disabled={pending || !signature} className="h-12 px-6 text-base">
            署名を保存して現金支払いへ
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
