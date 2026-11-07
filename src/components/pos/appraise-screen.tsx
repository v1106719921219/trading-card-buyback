'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Layers, PencilLine, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BuySteps } from '@/components/pos/buy-steps'
import { SummaryPane } from '@/components/pos/summary-pane'
import {
  addAppraisalItem,
  confirmAppraisal,
  removeAppraisalItem,
  reopenAppraisal,
  searchStoreProducts,
  updateAppraisalItem,
  type StoreProductHit,
} from '@/actions/pos-buyback'
import { applyConditionRate, formatYen, intakeNumberFromOrderNumber } from '@/lib/pos-buyback'
import { splitProductCode } from '@/lib/product-display'
import type { ConditionRank, Order, OrderItem, PriceBand } from '@/types/database'

type Mode = 'search' | 'bulk' | 'free'

/**
 * 査定（docs/pos/design.md 4 章 #4、7 章）。
 * 左: 商品を探す（型番優先）／まとめ買取／自由入力、状態ランク。右: 査定明細と合計。
 * 明細は 1 行ずつサーバーに保存するので、途中で画面を閉じても受付から続きができる。
 */
export function AppraiseScreen({
  order,
  items: initialItems,
  ranks,
  bands,
}: {
  order: Order
  items: OrderItem[]
  ranks: ConditionRank[]
  bands: PriceBand[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  // 明細はサーバーが正。追加・削除のたびに router.refresh() で読み直す
  const items = initialItems
  const locked = order.status !== '申込'

  const [mode, setMode] = useState<Mode>('search')
  const [rankCode, setRankCode] = useState<string | null>(ranks[0]?.code ?? null)
  const rank = ranks.find((r) => r.code === rankCode) ?? null

  // 商品検索
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StoreProductHit[]>([])
  const [searching, setSearching] = useState(false)
  const searchSeq = useRef(0)
  useEffect(() => {
    const q = query.trim()
    if (mode !== 'search' || q.length < 1) return
    const seq = ++searchSeq.current
    const t = setTimeout(async () => {
      setSearching(true)
      const res = await searchStoreProducts(q)
      if (seq !== searchSeq.current) return
      setSearching(false)
      if (res.error) toast.error(res.error)
      else setResults(res.products ?? [])
    }, 250)
    return () => clearTimeout(t)
  }, [query, mode])

  // 追加フォーム（商品を選んだ後・自由入力）
  const [draft, setDraft] = useState<{
    product: StoreProductHit | null
    name: string
    listPrice: number | null
    unitPrice: string
    quantity: string
    reason: string
  } | null>(null)

  function pickProduct(p: StoreProductHit) {
    setDraft({
      product: p,
      name: p.name,
      listPrice: p.price,
      unitPrice: String(applyConditionRate(p.price, rank?.rate ?? null)),
      quantity: '1',
      reason: '',
    })
  }

  // ランクを変えたら、選択中の商品の単価を計算し直す（手で直した単価は上書きしない: 計算値と同じときだけ）
  function changeRank(code: string) {
    const next = ranks.find((r) => r.code === code) ?? null
    setRankCode(code)
    setDraft((d) => {
      if (!d || d.listPrice === null) return d
      const prev = applyConditionRate(d.listPrice, rank?.rate ?? null)
      if (String(prev) !== d.unitPrice) return d
      return { ...d, unitPrice: String(applyConditionRate(d.listPrice, next?.rate ?? null)) }
    })
  }

  const draftUnit = draft ? Number(draft.unitPrice) : 0
  const draftExpected = draft && draft.listPrice !== null ? applyConditionRate(draft.listPrice, rank?.rate ?? null) : null
  const draftNeedsReason =
    draft !== null &&
    draft.listPrice !== null &&
    Number.isFinite(draftUnit) &&
    (draftUnit < (draftExpected ?? 0) || (rank?.rate === null && draftUnit < draft.listPrice))

  function submitDraft() {
    if (!draft) return
    const quantity = Number(draft.quantity)
    const unitPrice = Number(draft.unitPrice)
    if (!Number.isInteger(quantity) || quantity < 1) return toast.error('数量は 1 以上で入力してください')
    if (!Number.isInteger(unitPrice) || unitPrice < 0) return toast.error('単価は 0 円以上の整数で入力してください')
    if (draftNeedsReason && !draft.reason.trim()) return toast.error('ランク外の減額には理由を入力してください')
    startTransition(async () => {
      const res = await addAppraisalItem(order.id, {
        product_id: draft.product?.id ?? null,
        product_name: draft.name,
        list_price: draft.listPrice,
        unit_price: unitPrice,
        quantity,
        condition_rank: rankCode,
        price_band_id: null,
        deduction_reason: draft.reason.trim() || null,
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      setDraft(null)
      setQuery('')
      router.refresh()
    })
  }

  // まとめ買取
  const [bandId, setBandId] = useState<string | null>(bands[0]?.id ?? null)
  const [bandQty, setBandQty] = useState('')
  function submitBulk() {
    const quantity = Number(bandQty)
    if (!bandId) {
        toast.error('価格帯を選んでください')
        return
      }
    if (!Number.isInteger(quantity) || quantity < 1) return toast.error('枚数を入力してください')
    startTransition(async () => {
      const res = await addAppraisalItem(order.id, {
        product_id: null,
        product_name: '',
        list_price: null,
        unit_price: 0,
        quantity,
        condition_rank: null,
        price_band_id: bandId,
        deduction_reason: null,
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      setBandQty('')
      router.refresh()
    })
  }

  // 明細の編集・削除
  const [editing, setEditing] = useState<OrderItem | null>(null)
  const [editQty, setEditQty] = useState('')
  const [editUnit, setEditUnit] = useState('')
  const [editReason, setEditReason] = useState('')
  function openEdit(id: string) {
    if (locked) return
    const it = items.find((i) => i.id === id)
    if (!it) return
    setEditing(it)
    setEditQty(String(it.quantity))
    setEditUnit(String(it.unit_price))
    setEditReason(it.deduction_reason ?? '')
  }
  function saveEdit() {
    if (!editing) return
    const quantity = Number(editQty)
    const unitPrice = Number(editUnit)
    if (!Number.isInteger(quantity) || quantity < 1) return toast.error('数量は 1 以上で入力してください')
    if (!Number.isInteger(unitPrice) || unitPrice < 0) return toast.error('単価は 0 円以上の整数で入力してください')
    startTransition(async () => {
      const res = await updateAppraisalItem(order.id, editing.id, { quantity, unit_price: unitPrice, deduction_reason: editReason.trim() || null })
      if (res.error) {
        toast.error(res.error)
        return
      }
      setEditing(null)
      router.refresh()
    })
  }
  function remove(id: string) {
    startTransition(async () => {
      const res = await removeAppraisalItem(order.id, id)
      if (res.error) {
        toast.error(res.error)
        return
      }
      router.refresh()
    })
  }

  function next() {
    startTransition(async () => {
      const res = await confirmAppraisal(order.id)
      if (res.error) {
        toast.error(res.error)
        return
      }
      router.push(`/pos/buy/${order.id}/present`)
    })
  }
  function reopen() {
    startTransition(async () => {
      const res = await reopenAppraisal(order.id)
      if (res.error) {
        toast.error(res.error)
        return
      }
      router.refresh()
    })
  }

  const customerLabel = `受付 ${intakeNumberFromOrderNumber(order.order_number)} ・ ${order.customer_name} 様`

  return (
    <div className="flex flex-1 flex-col">
      <BuySteps current="査定" orderNumber={order.order_number} />
      <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[1fr_minmax(320px,38%)]">
        <div className="flex flex-col gap-4">
          {locked ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
              <span>この受付は査定確定済みです。明細を直すには査定をやり直してください。</span>
              <Button type="button" variant="outline" size="sm" onClick={reopen} disabled={pending}>
                査定をやり直す
              </Button>
            </div>
          ) : null}

          <section className="rounded-2xl border bg-card p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              <ModeButton active={mode === 'search'} onClick={() => setMode('search')} icon={<Search className="h-4 w-4" />} label="価格表から探す" />
              <ModeButton active={mode === 'bulk'} onClick={() => setMode('bulk')} icon={<Layers className="h-4 w-4" />} label="まとめ買取" />
              <ModeButton
                active={mode === 'free'}
                onClick={() => {
                  setMode('free')
                  setDraft({ product: null, name: '', listPrice: null, unitPrice: '', quantity: '1', reason: '' })
                }}
                icon={<PencilLine className="h-4 w-4" />}
                label="自由入力"
              />
            </div>

            {mode === 'search' ? (
              <>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="型番 または 名前（型番が最優先）例: SV4a 349 / リザードン"
                  className="h-12 text-base"
                  disabled={locked}
                  autoFocus
                />
                <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border">
                  {query.trim() === '' ? (
                    <p className="p-3 text-sm text-muted-foreground">型番か名前を入力すると候補が出ます。見つからないときは「自由入力」で追加できます。</p>
                  ) : searching && results.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">検索中…</p>
                  ) : results.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">見つかりません。「自由入力」で追加できます。</p>
                  ) : (
                    <ul className="divide-y">
                      {results.map((p) => {
                        const { name, code } = splitProductCode(p)
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              disabled={locked}
                              onClick={() => pickProduct(p)}
                              className={[
                                'flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50',
                                draft?.product?.id === p.id ? 'bg-amber-50' : '',
                              ].join(' ')}
                            >
                              <div className="flex-1">
                                <div className="font-medium leading-tight">{name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {code}
                                  {p.market_price ? ` ・ 相場 ${formatYen(p.market_price)}` : ''}
                                </div>
                              </div>
                              <span className="tabular-nums">{formatYen(p.price)}</span>
                              {rank ? <span className="rounded bg-muted px-1.5 text-xs">{rank.code}</span> : null}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </>
            ) : null}

            {mode === 'bulk' ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {bands.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      disabled={locked}
                      onClick={() => setBandId(b.id)}
                      className={[
                        'rounded-full border px-4 py-2 text-sm',
                        bandId === b.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
                      ].join(' ')}
                    >
                      {b.label}
                      {b.sleeve_color ? <span className="ml-1 text-xs opacity-80">（{b.sleeve_color}）</span> : null}
                    </button>
                  ))}
                  {bands.length === 0 ? <p className="text-sm text-muted-foreground">価格帯が未設定です。設定タブで登録してください。</p> : null}
                </div>
                <div className="flex items-end gap-2">
                  <label className="text-sm">
                    <span className="text-muted-foreground">枚数</span>
                    <Input value={bandQty} onChange={(e) => setBandQty(e.target.value)} inputMode="numeric" className="mt-1 h-11 w-32" placeholder="120" disabled={locked} />
                  </label>
                  <Button type="button" onClick={submitBulk} disabled={pending || locked} className="h-11">
                    明細に追加
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">1 枚ずつは登録しません。枚数は手で数えるのが基本（はかりで概算する場合は 1 枚およそ 1.7 g）。</p>
              </div>
            ) : null}

            {draft && (mode === 'search' || mode === 'free') ? (
              <div className="mt-3 rounded-xl border bg-muted/30 p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_120px_120px]">
                  <label className="text-sm sm:col-span-3">
                    <span className="text-muted-foreground">商品名</span>
                    <Input
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      readOnly={!!draft.product}
                      className="mt-1 h-11"
                      placeholder="商品名（価格表にない商品）"
                    />
                  </label>
                  <div className="text-sm">
                    <span className="text-muted-foreground">価格表の単価</span>
                    <div className="mt-1 flex h-11 items-center tabular-nums">{draft.listPrice !== null ? formatYen(draft.listPrice) : '—（自由入力）'}</div>
                  </div>
                  <label className="text-sm">
                    <span className="text-muted-foreground">買取単価</span>
                    <Input value={draft.unitPrice} onChange={(e) => setDraft({ ...draft, unitPrice: e.target.value })} inputMode="numeric" className="mt-1 h-11" />
                  </label>
                  <label className="text-sm">
                    <span className="text-muted-foreground">数量</span>
                    <Input value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} inputMode="numeric" className="mt-1 h-11" />
                  </label>
                  {draftNeedsReason ? (
                    <label className="text-sm sm:col-span-3">
                      <span className="text-muted-foreground">
                        減額理由（必須。ランク {rank?.code ?? '-'} の計算値 {formatYen(draftExpected ?? 0)} より低い）
                      </span>
                      <Input value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} className="mt-1 h-11" placeholder="例: 角に凹み" />
                    </label>
                  ) : null}
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setDraft(null)} disabled={pending}>
                    取消
                  </Button>
                  <Button type="button" onClick={submitDraft} disabled={pending || locked} className="h-11">
                    明細に追加
                  </Button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <h2 className="mb-2 font-bold">状態ランク（これから追加する商品に適用）</h2>
            <div className="flex flex-wrap gap-2">
              {ranks.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  disabled={locked}
                  onClick={() => changeRank(r.code)}
                  className={[
                    'rounded-full border px-4 py-2 text-sm',
                    rankCode === r.code ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
                  ].join(' ')}
                >
                  {r.code} {r.label}
                  {r.rate !== null ? ` ・ ${Math.round(Number(r.rate) * 100)}%` : ''}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {rank
                ? rank.rate !== null
                  ? `価格表 × ${Math.round(Number(rank.rate) * 100)}% で単価を計算します。ランク外の減額は理由の入力が必要です。`
                  : `${rank.code} は個別に金額と理由を入れます。`
                : '状態ランクが未設定です。'}
              {rank?.description ? ` ${rank.description}` : ''}
            </p>
          </section>

          {editing ? (
            <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <h2 className="mb-2 font-bold">明細を直す: {editing.product_name}</h2>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="text-sm">
                  <span className="text-muted-foreground">数量</span>
                  <Input value={editQty} onChange={(e) => setEditQty(e.target.value)} inputMode="numeric" className="mt-1 h-11 bg-background" />
                </label>
                <label className="text-sm">
                  <span className="text-muted-foreground">
                    買取単価{editing.list_price != null ? `（価格表 ${formatYen(editing.list_price)}）` : ''}
                  </span>
                  <Input value={editUnit} onChange={(e) => setEditUnit(e.target.value)} inputMode="numeric" className="mt-1 h-11 bg-background" />
                </label>
                <label className="text-sm">
                  <span className="text-muted-foreground">減額理由</span>
                  <Input value={editReason} onChange={(e) => setEditReason(e.target.value)} className="mt-1 h-11 bg-background" />
                </label>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
                  閉じる
                </Button>
                <Button type="button" onClick={saveEdit} disabled={pending}>
                  保存
                </Button>
              </div>
            </section>
          ) : null}
        </div>

        <div className="min-h-[320px] lg:sticky lg:top-14 lg:h-[calc(100vh-7.5rem)]">
          <SummaryPane
            items={items}
            customerLabel={customerLabel}
            onRemove={locked ? undefined : remove}
            onSelect={locked ? undefined : openEdit}
            selectedId={editing?.id ?? null}
            busy={pending}
          />
        </div>
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-card px-4 py-3">
        <Button asChild variant="ghost">
          <Link href="/pos/buy">
            <ArrowLeft className="h-4 w-4" />
            受付に戻る
          </Link>
        </Button>
        <Button type="button" onClick={next} disabled={pending || items.length === 0} className="h-12 px-6 text-base">
          査定結果を提示
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm',
        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
      ].join(' ')}
    >
      {icon}
      {label}
    </button>
  )
}
