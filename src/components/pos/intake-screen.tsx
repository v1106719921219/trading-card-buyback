'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Search, UserPlus, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BuySteps } from '@/components/pos/buy-steps'
import {
  createStoreIntake,
  searchStoreCustomers,
  type OpenIntake,
  type StoreCustomerHit,
} from '@/actions/pos-buyback'
import { INTAKE_KINDS, POS_STATUS_LABELS, formatIntakeTime, formatYen, intakeNumberFromOrderNumber, type IntakeKind } from '@/lib/pos-buyback'
import type { OrderStatus } from '@/types/database'

/**
 * 買取受付（docs/pos/design.md 4 章 #3）。
 * 顧客を電話番号か氏名で探す → なければ新規 → 持込点数と区分 → 受付番号を発行して査定へ。
 */
export function IntakeScreen({ intakes }: { intakes: OpenIntake[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StoreCustomerHit[] | null>(null)
  const [selected, setSelected] = useState<StoreCustomerHit | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [count, setCount] = useState('')
  const [kind, setKind] = useState<IntakeKind>('singles')

  function search() {
    const q = query.trim()
    if (!q) return
    startTransition(async () => {
      const res = await searchStoreCustomers(q)
      if (res.error) {
        toast.error(res.error)
        return
      }
      setResults(res.customers ?? [])
      setIsNew(false)
      if ((res.customers ?? []).length === 0) toast.info('見つかりませんでした。新規のお客様として進められます')
    })
  }

  function chooseNew() {
    setSelected(null)
    setIsNew(true)
    // 検索語が電話番号なら電話に、そうでなければ名前に入れておく
    if (/^[\d\-ー－\s]+$/.test(query.normalize('NFKC').trim())) setNewPhone(query.trim())
    else setNewName(query.trim())
  }

  function submit() {
    const intakeCount = count.trim() === '' ? null : Number(count)
    if (intakeCount !== null && (!Number.isInteger(intakeCount) || intakeCount < 0)) {
      toast.error('持込点数は 0 以上の整数で入力してください')
      return
    }
    startTransition(async () => {
      const res = await createStoreIntake({
        customer_id: selected?.id ?? null,
        name: isNew ? newName : '',
        phone: isNew ? newPhone : '',
        intake_count: intakeCount,
        intake_kind: kind,
      })
      if (res.error || !res.orderId) {
        toast.error(res.error ?? '受付を作れませんでした')
        return
      }
      toast.success(`受付 ${intakeNumberFromOrderNumber(res.orderNumber ?? '')} を発行しました`)
      router.push(`/pos/buy/${res.orderId}/appraise`)
    })
  }

  const customerLabel = selected
    ? `${selected.name || '（名前未登録）'} 様を選択中`
    : isNew
      ? '新規のお客様として進めます'
      : '顧客を選ぶか、新規で進めます'

  return (
    <div className="flex flex-1 flex-col">
      <BuySteps current="受付" />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4">
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="mb-3 font-bold">お客様</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') search()
              }}
              placeholder="電話番号 または 氏名"
              inputMode="search"
              className="h-12 text-base"
              autoFocus
            />
            <Button type="button" onClick={search} disabled={pending || !query.trim()} className="h-12 px-5">
              <Search className="h-4 w-4" />
              検索
            </Button>
            <Button type="button" variant={isNew ? 'default' : 'outline'} onClick={chooseNew} disabled={pending} className="h-12 px-5">
              <UserPlus className="h-4 w-4" />
              新規のお客様
            </Button>
          </div>

          {results && results.length > 0 ? (
            <ul className="mt-3 divide-y rounded-xl border">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(c)
                      setIsNew(false)
                    }}
                    className={[
                      'flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50',
                      selected?.id === c.id ? 'bg-amber-50' : '',
                    ].join(' ')}
                  >
                    <div className="flex-1">
                      <div className="font-medium">{c.name || '（名前未登録）'}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.phone ?? '電話番号なし'} ・ 来店 {c.visit_count} 回
                        {c.last_visit_at ? ` ・ 前回 ${new Date(c.last_visit_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })}` : ''}
                        {c.last_document_type ? `（${c.last_document_type}で確認済み）` : ''}
                      </div>
                    </div>
                    {c.last_verified_at ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">本人確認 記録あり</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {isNew ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-sm">
                <span className="text-muted-foreground">お名前（任意。本人確認で確定します）</span>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="mt-1 h-11" placeholder="山本 拓也" />
              </label>
              <label className="text-sm">
                <span className="text-muted-foreground">電話番号（任意）</span>
                <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="mt-1 h-11" inputMode="tel" placeholder="090-1234-5678" />
              </label>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border bg-card p-4">
          <h2 className="mb-3 font-bold">持込内容</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-muted-foreground">持込点数（概算・任意）</span>
              <Input value={count} onChange={(e) => setCount(e.target.value)} className="mt-1 h-11" inputMode="numeric" placeholder="6" />
            </label>
            <div className="text-sm">
              <span className="text-muted-foreground">区分</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {INTAKE_KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setKind(k.value)}
                    className={[
                      'rounded-full border px-4 py-2 text-sm',
                      kind === k.value ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
                    ].join(' ')}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">受付番号は自動で振られます。受付票の印刷はプリンタ接続後に足します。</p>
        </section>

        {intakes.length > 0 ? (
          <section className="rounded-2xl border bg-card p-4">
            <h2 className="mb-3 font-bold">進行中の受付</h2>
            <ul className="divide-y">
              {intakes.map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {POS_STATUS_LABELS[o.status as OrderStatus] ?? o.status}
                  </span>
                  <div className="flex-1 text-sm">
                    <div className="font-medium">
                      受付 {intakeNumberFromOrderNumber(o.order_number)} ・ {o.customer_name} 様
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {o.intake_count != null ? `持込 ${o.intake_count} 点 ・ ` : ''}
                      {formatIntakeTime(o.created_at)} 受付
                      {o.item_count > 0 ? ` ・ 明細 ${o.item_count} 点 ${formatYen(o.total_amount)}` : ''}
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={o.status === '検品完了' ? `/pos/buy/${o.id}/present` : `/pos/buy/${o.id}/appraise`}>
                      {o.status === '検品完了' ? '提示へ' : '続ける'}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-card px-4 py-3">
        <span className="text-sm text-muted-foreground">{customerLabel}</span>
        <div className="flex gap-2">
          <Button asChild variant="ghost">
            <Link href="/pos">待機画面へ</Link>
          </Button>
          <Button type="button" onClick={submit} disabled={pending} className="h-12 px-6 text-base">
            査定へ
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
