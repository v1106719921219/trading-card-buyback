'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminHeader } from '@/components/admin/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import type { BoxCondition, BoxPriceSource } from '@/lib/box-price-sources'

type Product = { id: string; name: string; model_number: string | null; set_number: string | null; price: number; is_active: boolean; subcategory_id: string | null }
type Condition = { id: BoxCondition; label: string }
type Quote = { productId: string; sourceId: string; condition: BoxCondition; price: number; url: string; note: string; checkedAt: string }
type Data = { products: Product[]; quotes: Quote[]; sources: BoxPriceSource[]; conditions: Condition[]; canEdit: boolean }
const yen = (amount: number) => `${amount.toLocaleString('ja-JP')}円`
const dateTime = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function BoxPriceComparisonPage() {
  const [data, setData] = useState<Data | null>(null)
  const [query, setQuery] = useState('')
  const [productId, setProductId] = useState('')
  const [sourceId, setSourceId] = useState('expo')
  const [condition, setCondition] = useState<BoxCondition>('shrink')
  const [amount, setAmount] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [ownPrices, setOwnPrices] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/admin/box-price-comparison', { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '比較データを取得できませんでした')
      setData(result)
      setOwnPrices(Object.fromEntries(result.products.map((product: Product) => [product.id, String(product.price)])))
      setProductId((current: string) => current || result.products[0]?.id || '')
      setSourceId((current: string) => current || result.sources[0]?.id || '')
      setSourceUrl((current: string) => current || result.sources[0]?.url || '')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  const source = data?.sources.find((item) => item.id === sourceId)
  const visibleProducts = useMemo(() => (data?.products ?? []).filter((product) =>
    `${product.name} ${product.model_number ?? ''} ${product.set_number ?? ''}`.normalize('NFKC').toLowerCase().includes(query.normalize('NFKC').toLowerCase())
  ), [data, query])

  async function saveQuote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!data?.canEdit || !productId || !sourceId || amount === '') return
    const numericPrice = Number(amount)
    if (!Number.isSafeInteger(numericPrice) || numericPrice < 0) { toast.error('価格は0円以上の整数で入力してください'); return }
    setSaving(true)
    try {
      const response = await fetch('/api/admin/box-price-comparison', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'quote', productId, sourceId, condition, price: numericPrice, url: sourceUrl || source?.url, note, checkedAt: new Date().toISOString() }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '保存できませんでした')
      toast.success('他社価格を記録しました')
      setAmount(''); setNote('')
      await load()
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : String(cause)) }
    finally { setSaving(false) }
  }

  async function saveOwnPrice(product: Product) {
    if (!data?.canEdit) return
    const price = Number(ownPrices[product.id])
    if (!Number.isSafeInteger(price) || price < 0) { toast.error('自社価格は0円以上の整数で入力してください'); return }
    if (!window.confirm(`${product.name}\n自社買取価格を ${yen(product.price)} から ${yen(price)} に変更しますか？`)) return
    setSaving(true)
    try {
      const response = await fetch('/api/admin/box-price-comparison', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'buyback_price', productId: product.id, expected: product.price, price }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '自社買取価格を保存できませんでした')
      toast.success('自社買取価格を変更しました')
      await load()
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : String(cause)) }
    finally { setSaving(false) }
  }

  return <>
    <AdminHeader title="BOX他社価格比較" description="当日の他社買取価格を条件別に確認し、自社BOX価格を決めます" />
    <main className="space-y-5 p-4 md:p-6">
      <section className="rounded-lg border bg-muted/20 p-4 text-sm">
        <p className="font-semibold">価格の見方</p>
        <p className="mt-1 text-muted-foreground">リンク先で当日の価格・受付状況を確認して記録します。条件が異なる価格は分けて保存し、過去日の記録も残ります。サイト側の数量条件やLINE限定価格などはメモに記録してください。</p>
      </section>

      <form onSubmit={saveQuote} className="grid gap-3 rounded-lg border p-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm">自社BOX商品<select className="mt-1 block w-full rounded border bg-background p-2" value={productId} onChange={(event) => setProductId(event.target.value)}>
          {(data?.products ?? []).map((product) => <option key={product.id} value={product.id}>{product.name}{product.model_number ? ` / ${product.model_number}` : ''}</option>)}
        </select></label>
        <label className="text-sm">買取店<select className="mt-1 block w-full rounded border bg-background p-2" value={sourceId} onChange={(event) => { setSourceId(event.target.value); setSourceUrl(data?.sources.find((item) => item.id === event.target.value)?.url ?? '') }}>
          {(data?.sources ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label className="text-sm">商品状態<select className="mt-1 block w-full rounded border bg-background p-2" value={condition} onChange={(event) => setCondition(event.target.value as BoxCondition)}>
          {(data?.conditions ?? []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
        <label className="text-sm">確認した買取価格（税込・円）<Input required type="number" min="0" step="1" className="mt-1" placeholder="例：18,000" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <div className="text-sm md:col-span-2 xl:col-span-4">
          <a href={source?.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 underline">{source?.name ?? '買取店'}の価格ページを開く ↗</a>
          <span className="ml-2 text-xs text-muted-foreground">{source?.note}</span>
        </div>
        <label className="text-sm md:col-span-2">確認したページURL<Input className="mt-1" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" /></label>
        <label className="text-sm md:col-span-2">条件メモ<Input className="mt-1" value={note} onChange={(event) => setNote(event.target.value)} placeholder="受付上限、LINE限定、更新時刻など" /></label>
        <div className="flex items-end"><Button type="submit" disabled={!data?.canEdit || saving || loading || !productId || amount === ''}>確認価格を記録</Button></div>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <Input className="max-w-sm" placeholder="BOX名・型番で検索" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Button variant="outline" onClick={() => void load()} disabled={loading}>最新データを再読み込み</Button>
        <span className="text-sm text-muted-foreground">{visibleProducts.length}商品</span>
        {loading && <span role="status" className="text-sm">読み込み中…</span>}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {!loading && visibleProducts.length === 0 && <p className="rounded border p-5 text-sm">BOX商品が見つかりません。商品管理でカテゴリをBOXにするか、商品名に「BOX」「ボックス」を含めてください。</p>}

      <div className="space-y-4">
        {visibleProducts.map((product) => {
          const history = (data?.quotes ?? []).filter((quote) => quote.productId === product.id).sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt))
          const latest = new Map<string, Quote>()
          for (const quote of history) {
            const key = `${quote.sourceId}:${quote.condition}`
            if (!latest.has(key)) latest.set(key, quote)
          }
          const latestQuotes = [...latest.values()]
          const olderQuotes = history.filter((quote) => !latestQuotes.includes(quote))
          return <section key={product.id} className="rounded-lg border">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 p-3">
              <div><h2 className="font-semibold">{product.name}</h2><p className="text-xs text-muted-foreground">{[product.set_number, product.model_number].filter(Boolean).join(' / ')}</p></div>
              <div className="flex flex-wrap items-center gap-2 text-sm"><span>現在の自社価格 <strong>{yen(product.price)}</strong></span><Input aria-label={`${product.name}の新しい自社買取価格`} type="number" min="0" step="1" className="w-36" disabled={!data?.canEdit} value={ownPrices[product.id] ?? String(product.price)} onChange={(event) => setOwnPrices((current) => ({ ...current, [product.id]: event.target.value }))} /><Button size="sm" disabled={!data?.canEdit || saving || Number(ownPrices[product.id]) === product.price} onClick={() => void saveOwnPrice(product)}>自社価格を変更</Button></div>
            </div>
            {latest.size === 0 ? <p className="p-4 text-sm text-muted-foreground">他社価格は未記録です。上のフォームから今日確認した価格を登録してください。</p> : <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
              {[...latest.values()].map((quote) => {
                const store = data?.sources.find((item) => item.id === quote.sourceId)
                const state = data?.conditions.find((item) => item.id === quote.condition)?.label ?? quote.condition
                const isToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date(quote.checkedAt)) === new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
                return <div key={`${quote.sourceId}-${quote.condition}`} className="rounded border p-3">
                  <div className="flex items-start justify-between gap-2"><div><a href={quote.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 underline">{store?.name ?? quote.sourceId}</a><div className="text-xs text-muted-foreground">{state}</div></div><span className={`rounded px-2 py-0.5 text-xs ${isToday ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{isToday ? '本日確認' : '前回確認'}</span></div>
                  <p className="mt-2 text-xl font-bold">{yen(quote.price)}</p><p className="text-xs text-muted-foreground">{dateTime.format(new Date(quote.checkedAt))} JST</p>
                  {quote.note && <p className="mt-1 text-xs">{quote.note}</p>}
                </div>
              })}
            </div>}
            {olderQuotes.length > 0 && <details className="border-t p-3 text-sm"><summary className="cursor-pointer">過去の確認履歴（{olderQuotes.length}件）</summary><ul className="mt-2 space-y-1">{olderQuotes.map((quote, index) => <li key={`${quote.sourceId}-${quote.condition}-${quote.checkedAt}-${index}`} className="text-muted-foreground">{dateTime.format(new Date(quote.checkedAt))} JST / {data?.sources.find((item) => item.id === quote.sourceId)?.name} / {data?.conditions.find((item) => item.id === quote.condition)?.label} / {yen(quote.price)}{quote.note ? ` / ${quote.note}` : ''}</li>)}</ul></details>}
          </section>
        })}
      </div>
      <p className="text-xs text-muted-foreground">参考価格の記録は、お客様向け買取価格を自動変更しません。自社価格を変更する場合は商品行のボタンから別途保存します。価格一覧に公開中の商品は、変更後すぐ表示価格にも反映されます。</p>
    </main>
  </>
}
