'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminHeader } from '@/components/admin/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import type { BoxCondition, BoxPriceSource } from '@/lib/box-price-sources'

type Product = { id: string; name: string; model_number: string | null; set_number: string | null; price: number; is_active: boolean; category_id: string; category_name: string; category_sort_order: number; subcategory_id: string | null; subcategory_sort_order: number; sort_order: number }
type Condition = { id: BoxCondition; label: string }
type Quote = { productId: string; sourceId: string; condition: BoxCondition; price: number; url: string; note: string; checkedAt: string }
type Data = { products: Product[]; quotes: Quote[]; sources: BoxPriceSource[]; conditions: Condition[]; canEdit: boolean }
const yen = (amount: number) => `${amount.toLocaleString('ja-JP')}円`
const dateTime = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function BoxPriceComparisonPage() {
  const [data, setData] = useState<Data | null>(null)
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [productId, setProductId] = useState('')
  const [sourceId, setSourceId] = useState('expo')
  const [condition, setCondition] = useState<BoxCondition>('shrink')
  const [displayCondition, setDisplayCondition] = useState<BoxCondition>('shrink')
  const [amount, setAmount] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [collecting, setCollecting] = useState(false)
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
  const productCategories = useMemo(() => {
    const unique = new Map<string, { name: string; sortOrder: number }>()
    for (const product of data?.products ?? []) unique.set(product.category_id, { name: product.category_name, sortOrder: product.category_sort_order })
    return [...unique.entries()].sort((a, b) => a[1].sortOrder - b[1].sortOrder || a[1].name.localeCompare(b[1].name, 'ja'))
  }, [data])
  const visibleProducts = useMemo(() => (data?.products ?? []).filter((product) =>
    (categoryId === 'all' || product.category_id === categoryId) &&
    `${product.name} ${product.model_number ?? ''} ${product.set_number ?? ''}`.normalize('NFKC').toLowerCase().includes(query.normalize('NFKC').toLowerCase())
  ), [data, query, categoryId])
  const comparisonSources = data?.sources ?? []
  const comparisonConditions = data?.conditions ?? []

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

  async function collectPrices() {
    setCollecting(true)
    try {
      const response = await fetch('/api/admin/box-price-comparison/collect', { method: 'POST' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '自動取得に失敗しました')
      const errors = (result.sources ?? []).filter((item: { error: string | null }) => item.error)
      toast.success(`${result.saved}件の他社価格を自動取得しました${errors.length ? `（取得できない店舗 ${errors.length}件）` : ''}`)
      await load()
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : String(cause)) }
    finally { setCollecting(false) }
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
        <p className="mt-1 text-muted-foreground">公開HTMLから機械的に取得できる店舗は毎日9時（日本時間）に更新します。取得対象は買取ホムラ・おたちゅう。です。ほかの店舗は手入力で記録できます。価格は条件別・確認日付きで保存します。</p>
      </section>

      <details className="rounded-lg border">
        <summary className="cursor-pointer list-inside p-4 font-semibold">他社価格を記録・更新</summary>
        <form onSubmit={saveQuote} className="grid gap-3 border-t p-4 md:grid-cols-2 xl:grid-cols-4">
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
      </details>

      <section className="space-y-3 rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">買取価格を一覧で比較</h2>
          <p className="text-xs text-muted-foreground">商品ごとに各店の最新価格を表示します。金額を押すと確認元を開けます。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        <Input className="max-w-sm" placeholder="BOX名・型番で検索" value={query} onChange={(event) => setQuery(event.target.value)} />
        {data?.canEdit && <Button variant="outline" onClick={() => void collectPrices()} disabled={collecting || loading}>{collecting ? '自動取得中…' : '対応店から今すぐ取得'}</Button>}
        <Button variant="outline" onClick={() => void load()} disabled={loading}>最新データを再読み込み</Button>
        <span className="text-sm text-muted-foreground">{visibleProducts.length}商品</span>
        {loading && <span role="status" className="text-sm">読み込み中…</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="商品状態で絞り込み">
        {comparisonConditions.map((item) => <Button key={item.id} type="button" size="sm" variant={displayCondition === item.id ? 'default' : 'outline'} onClick={() => setDisplayCondition(item.id)}>{item.label}</Button>)}
      </div>
      <div className="flex flex-wrap gap-2" aria-label="カードカテゴリで絞り込み">
        <Button type="button" size="sm" variant={categoryId === 'all' ? 'default' : 'outline'} onClick={() => setCategoryId('all')}>すべて</Button>
        {productCategories.map(([id, category]) => <Button key={id} type="button" size="sm" variant={categoryId === id ? 'default' : 'outline'} onClick={() => setCategoryId(id)}>{category.name}</Button>)}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {!loading && visibleProducts.length === 0 && <p className="rounded border p-5 text-sm">BOX商品が見つかりません。商品管理でカテゴリをBOXにするか、商品名に「BOX」「ボックス」を含めてください。</p>}
      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-max border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th className="sticky left-0 z-20 min-w-64 border-b bg-muted p-3 text-left">BOX商品</th>
              <th className="min-w-32 border-b p-3 text-right">自社価格</th>
              <th className="min-w-32 border-b p-3 text-right">他社最高額</th>
              {comparisonSources.map((store) => <th key={store.id} className="min-w-36 border-b p-3 text-center">{store.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleProducts.map((product) => {
              const history = (data?.quotes ?? []).filter((quote) => quote.productId === product.id).sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt))
              const latest = new Map<string, Quote>()
              for (const quote of history) {
                if (quote.condition === displayCondition && !latest.has(quote.sourceId)) latest.set(quote.sourceId, quote)
              }
              const prices = [...latest.values()].map((quote) => quote.price)
              const highest = prices.length ? Math.max(...prices) : null
              const latestQuotes = [...latest.values()]
              const olderQuotes = history.filter((quote) => !latestQuotes.includes(quote))
              return <tr key={product.id} className="hover:bg-muted/20">
                <th scope="row" className="sticky left-0 z-[1] border-b bg-background p-3 text-left align-top">
                  <div className="font-medium">{product.name}</div>
                  <div className="text-xs font-normal text-muted-foreground">{[product.set_number, product.model_number].filter(Boolean).join(' / ')}</div>
                  {olderQuotes.length > 0 && <details className="mt-1 text-xs font-normal"><summary className="cursor-pointer text-blue-700">履歴 {olderQuotes.length}件</summary><ul className="mt-1 space-y-1">{olderQuotes.map((quote, index) => <li key={`${quote.sourceId}-${quote.condition}-${quote.checkedAt}-${index}`} className="text-muted-foreground">{dateTime.format(new Date(quote.checkedAt))} / {data?.sources.find((item) => item.id === quote.sourceId)?.name} / {data?.conditions.find((item) => item.id === quote.condition)?.label} / {yen(quote.price)}{quote.note ? ` / ${quote.note}` : ''}</li>)}</ul></details>}
                </th>
                <td className="border-b p-3 text-right">
                  <div className="font-semibold">{yen(product.price)}</div>
                  <div className="mt-1 flex items-center justify-end gap-1">
                    <Input aria-label={`${product.name}の新しい自社買取価格`} type="number" min="0" step="1" className="h-8 w-24" disabled={!data?.canEdit} value={ownPrices[product.id] ?? String(product.price)} onChange={(event) => setOwnPrices((current) => ({ ...current, [product.id]: event.target.value }))} />
                    <Button size="sm" className="h-8 px-2" disabled={!data?.canEdit || saving || Number(ownPrices[product.id]) === product.price} onClick={() => void saveOwnPrice(product)}>変更</Button>
                  </div>
                </td>
                <td className="border-b p-3 text-right font-semibold text-emerald-700">{highest === null ? '—' : yen(highest)}</td>
                {comparisonSources.map((store) => {
                  const quote = latest.get(store.id)
                  const isToday = quote ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date(quote.checkedAt)) === new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date()) : false
                  const isHighest = quote !== undefined && quote.price === highest
                  return <td key={store.id} className={`border-b p-3 text-center ${isHighest ? 'bg-emerald-50' : ''}`}>
                    {quote ? <a href={quote.url || store.url} target="_blank" rel="noopener noreferrer" title={`${store.name} / ${dateTime.format(new Date(quote.checkedAt))} JST${quote.note ? ` / ${quote.note}` : ''}`} className="inline-flex flex-col items-center rounded px-2 py-1 hover:bg-muted">
                      <span className="font-semibold">{yen(quote.price)}</span>
                      <span className={`text-[11px] ${isToday ? 'text-emerald-700' : 'text-amber-700'}`}>{isToday ? '本日' : dateTime.format(new Date(quote.checkedAt))}</span>
                    </a> : <span className="text-muted-foreground">—</span>}
                  </td>
                })}
              </tr>
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">— は未記録です。緑色のセルは表示中の状態で他社最高額です。価格は確認日付きで、今日以外の価格は確認日時を表示します。</p>
      </section>
      <p className="text-xs text-muted-foreground">参考価格の記録は、お客様向け買取価格を自動変更しません。自社価格を変更する場合は商品行のボタンから別途保存します。価格一覧に公開中の商品は、変更後すぐ表示価格にも反映されます。</p>
    </main>
  </>
}
