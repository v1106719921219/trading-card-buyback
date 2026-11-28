'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ClipboardList, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addManualInventory, adjustInventory, allocateInventory, setInventorySalePrice } from '@/actions/pos-sales'
import { formatYen } from '@/lib/pos-buyback'
import { INVENTORY_SOURCE_LABELS, daysSince } from '@/lib/pos-sales'
import type { ConditionRank, InventoryItem, PriceBand } from '@/types/database'

export type StockTab = 'pending' | 'store' | 'bands'

const TABS: { value: StockTab; label: string }[] = [
  { value: 'pending', label: '振分待ち' },
  { value: 'store', label: '店頭在庫' },
  { value: 'bands', label: '価格帯' },
]

function toInt(v: string): number {
  const n = Number(v)
  return v.trim() !== '' && Number.isInteger(n) ? n : NaN
}

/**
 * 在庫（docs/pos/design.md 4 章 #9、6.7 節）。
 * 振分待ち: 買い取った物を「店頭販売（売価を付ける）／価格帯／本部へ移動」に回す。
 * 店頭在庫: 売価の変更、数量の調整、手入力での入庫。
 * 価格帯: 帯ごとの枚数（理論値）を実数に合わせる。
 */
export function StockScreen({
  tab,
  q,
  items,
  bands,
  ranks,
  counts,
}: {
  tab: StockTab
  q: string
  items: InventoryItem[]
  bands: PriceBand[]
  ranks: ConditionRank[]
  counts: { pending: number; store: number; storeUnpriced: number }
}) {
  const router = useRouter()
  const [query, setQuery] = useState(q)
  const [adding, setAdding] = useState(false)

  function go(next: { tab?: StockTab; q?: string }) {
    const p = new URLSearchParams()
    p.set('tab', next.tab ?? tab)
    const nq = (next.q ?? query).trim()
    if (nq) p.set('q', nq)
    router.push(`/pos/stock?${p.toString()}`)
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-lg font-bold">在庫</h1>
        {tab !== 'bands' ? (
          <>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go({})} placeholder="商品名・型番・バーコード" className="h-10 w-56" />
            <Button type="button" variant="outline" onClick={() => go({})} className="h-10">
              <Search className="h-4 w-4" />
              検索
            </Button>
          </>
        ) : null}
        <Button asChild variant="outline" className="h-10">
          <Link href="/pos/stock/stocktake">
            <ClipboardList className="h-4 w-4" />
            棚卸し
          </Link>
        </Button>
        <Button type="button" onClick={() => setAdding((v) => !v)} className="h-10">
          <Plus className="h-4 w-4" />
          手入力で入庫
        </Button>
      </div>

      {adding ? <ManualForm ranks={ranks} onDone={() => { setAdding(false); router.refresh() }} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => go({ tab: t.value, q: '' })}
            className={['rounded-full border px-4 py-1.5 text-sm', tab === t.value ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'].join(' ')}
          >
            {t.label}
            {t.value === 'pending' && counts.pending > 0 ? ` ${counts.pending}` : ''}
            {t.value === 'store' ? ` ${counts.store}` : ''}
          </button>
        ))}
        {counts.storeUnpriced > 0 ? <span className="text-sm text-amber-700">売価未設定 {counts.storeUnpriced} 件</span> : null}
      </div>

      {tab === 'bands' ? (
        <BandList bands={bands} />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {q ? '該当する在庫がありません' : tab === 'pending' ? '振分待ちの在庫はありません。買取の支払いが終わると、ここに入ります。' : '店頭在庫はありません。振分待ちから「店頭販売」に回すか、手入力で入庫してください。'}
        </div>
      ) : (
        <ul className="space-y-2">
          {/* 数量・売価が変わったら入力欄を作り直す */}
          {items.map((item) => {
            const key = `${item.id}:${item.quantity}:${item.sale_price ?? ''}`
            return tab === 'pending' ? <PendingRow key={key} item={item} bands={bands} /> : <StoreRow key={key} item={item} />
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        最大 300 件まで表示します。まとめて数え直すときは「棚卸し」を使ってください。ラベル印刷・本部からの入庫・開封入庫は、機材と運用が決まり次第ここに足します。
      </p>
    </div>
  )
}

function ItemHead({ item }: { item: InventoryItem }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate font-medium">{item.name}</div>
      <div className="truncate text-xs text-muted-foreground">
        {[
          item.model_number,
          item.condition_rank ? `ランク ${item.condition_rank}` : null,
          item.psa_cert_number ? `PSA ${item.psa_cert_number}` : null,
          item.barcode,
          INVENTORY_SOURCE_LABELS[item.source] ?? item.source,
          `入庫から ${daysSince(item.created_at)} 日`,
        ]
          .filter(Boolean)
          .join(' ・ ')}
      </div>
    </div>
  )
}

function PendingRow({ item, bands }: { item: InventoryItem; bands: PriceBand[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [qty, setQty] = useState(String(item.quantity))
  const [price, setPrice] = useState('')
  const [bandId, setBandId] = useState('')

  function run(target: 'store' | 'band' | 'transfer') {
    const quantity = toInt(qty)
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > item.quantity) return toast.error(`枚数は 1〜${item.quantity} で入力してください`)
    const salePrice = toInt(price)
    if (target === 'store' && (!Number.isFinite(salePrice) || salePrice < 0)) return toast.error('売価を入力してください')
    if (target === 'band' && !bandId) return toast.error('価格帯を選んでください')
    if (target === 'store' && salePrice < item.cost && !window.confirm(`売価 ${formatYen(salePrice)} は仕入単価 ${formatYen(item.cost)} を下回ります。このまま登録しますか？`)) return
    startTransition(async () => {
      const res = await allocateInventory({ itemId: item.id, target, quantity, salePrice: target === 'store' ? salePrice : null, bandId: target === 'band' ? bandId : null })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(target === 'store' ? '店頭販売に回しました' : target === 'band' ? '価格帯に回しました' : '本部へ移動にしました')
      router.refresh()
    })
  }

  return (
    <li className="rounded-2xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <ItemHead item={item} />
        <div className="whitespace-nowrap text-right text-sm">
          <div className="text-xs text-muted-foreground">仕入単価</div>
          <div className="font-bold tabular-nums">{formatYen(item.cost)}</div>
        </div>
        <div className="whitespace-nowrap text-right text-sm">
          <div className="text-xs text-muted-foreground">数量</div>
          <div className="font-bold tabular-nums">{item.quantity}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        {item.quantity > 1 ? (
          <label className="text-xs text-muted-foreground">
            回す枚数
            <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" className="mt-1 h-10 w-20 text-right" />
          </label>
        ) : null}
        <label className="text-xs text-muted-foreground">
          売価（税込）
          <Input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="例: 1500" className="mt-1 h-10 w-28 text-right" />
        </label>
        <Button type="button" onClick={() => run('store')} disabled={pending} className="h-10">
          店頭販売へ
        </Button>
        <span className="mx-1 hidden h-8 w-px bg-border sm:block" />
        <select value={bandId} onChange={(e) => setBandId(e.target.value)} className="h-10 rounded-md border bg-background px-2 text-sm" aria-label="価格帯">
          <option value="">価格帯を選ぶ</option>
          {bands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
              {b.sell_price !== null ? `（売価 ${formatYen(b.sell_price)}）` : ''}
              {b.sleeve_color ? ` ${b.sleeve_color}` : ''}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" onClick={() => run('band')} disabled={pending} className="h-10">
          価格帯へ
        </Button>
        <Button type="button" variant="outline" onClick={() => run('transfer')} disabled={pending} className="ml-auto h-10">
          本部へ移動
        </Button>
      </div>
    </li>
  )
}

function StoreRow({ item }: { item: InventoryItem }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [price, setPrice] = useState(item.sale_price === null ? '' : String(item.sale_price))
  const [adjusting, setAdjusting] = useState(false)
  const [qty, setQty] = useState(String(item.quantity))
  const [reason, setReason] = useState('')
  const dirty = price !== (item.sale_price === null ? '' : String(item.sale_price))

  function savePrice() {
    const n = toInt(price)
    if (!Number.isFinite(n) || n < 0) return toast.error('売価を入力してください')
    startTransition(async () => {
      const res = await setInventorySalePrice(item.id, n)
      if (res.error) {
        toast.error(res.error)
        return
      }
      if (res.belowCost) toast.warning(`売価を ${formatYen(n)} にしました（仕入単価 ${formatYen(item.cost)} を下回っています）`)
      else toast.success(`売価を ${formatYen(n)} にしました`)
      router.refresh()
    })
  }

  function saveAdjust() {
    const n = toInt(qty)
    if (!Number.isFinite(n) || n < 0) return toast.error('数量を 0 以上で入力してください')
    if (n === item.quantity) return toast.error('数量が変わっていません')
    if (!reason.trim()) return toast.error('理由を入力してください')
    startTransition(async () => {
      const res = await adjustInventory({ itemId: item.id, newQuantity: n, reason })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(n === 0 ? '在庫から外しました（除却）' : `数量を ${n} にしました`)
      setAdjusting(false)
      setReason('')
      router.refresh()
    })
  }

  return (
    <li className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <ItemHead item={item} />
        <div className="whitespace-nowrap text-right text-sm">
          <div className="text-xs text-muted-foreground">仕入単価</div>
          <div className="tabular-nums">{formatYen(item.cost)}</div>
        </div>
        <div className="whitespace-nowrap text-right text-sm">
          <div className="text-xs text-muted-foreground">数量</div>
          <div className="font-bold tabular-nums">{item.quantity}</div>
        </div>
        <label className="text-xs text-muted-foreground">
          売価（税込）
          <div className="mt-1 flex gap-1">
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && dirty && savePrice()}
              inputMode="numeric"
              placeholder="未設定"
              className={`h-10 w-28 text-right text-base font-bold ${item.sale_price === null ? 'border-amber-400' : ''}`}
            />
            <Button type="button" onClick={savePrice} disabled={pending || !dirty} className="h-10">
              保存
            </Button>
          </div>
        </label>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAdjusting((v) => !v)} className="self-end">
          数量を直す
        </Button>
      </div>
      {adjusting ? (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-muted/50 p-3">
          <label className="text-xs text-muted-foreground">
            実際の数量
            <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" className="mt-1 h-10 w-24 bg-background text-right" />
          </label>
          <label className="flex-1 text-xs text-muted-foreground">
            理由
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="紛失、破損、数え直し など" className="mt-1 h-10 bg-background" />
          </label>
          <Button type="button" onClick={saveAdjust} disabled={pending} className="h-10">
            数量を確定
          </Button>
        </div>
      ) : null}
    </li>
  )
}

function BandList({ bands }: { bands: PriceBand[] }) {
  if (bands.length === 0) {
    return <div className="rounded-2xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">価格帯がありません。設定タブで登録してください。</div>
  }
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {bands.map((b) => (
          <BandRow key={`${b.id}:${b.stock_quantity ?? 0}`} band={b} />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        価格帯は 1 枚ずつ記録せず、帯ごとの枚数だけを持ちます。売価・スリーブの色は <Link href="/pos/settings" className="underline">設定</Link> で変えます。枚数が実際と違うときは「枚数を直す」で合わせてください。
      </p>
    </div>
  )
}

function BandRow({ band }: { band: PriceBand }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const stock = band.stock_quantity ?? 0
  const [open, setOpen] = useState(false)
  const [qty, setQty] = useState(String(Math.max(0, stock)))
  const [reason, setReason] = useState('')

  function save() {
    const n = toInt(qty)
    if (!Number.isFinite(n) || n < 0) return toast.error('枚数を 0 以上で入力してください')
    if (n === stock) return toast.error('枚数が変わっていません')
    if (!reason.trim()) return toast.error('理由を入力してください')
    startTransition(async () => {
      const res = await adjustInventory({ bandId: band.id, newQuantity: n, reason })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`「${band.label}」を ${n} 枚にしました`)
      setOpen(false)
      setReason('')
      router.refresh()
    })
  }

  return (
    <li className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{band.label}</div>
          <div className="text-xs text-muted-foreground">{band.sleeve_color ? `スリーブ: ${band.sleeve_color}` : 'スリーブの色 未設定'}</div>
        </div>
        <Cell label="買取" value={formatYen(band.buy_price)} />
        <Cell label="売価（税込）" value={band.sell_price === null ? '未設定' : formatYen(band.sell_price)} warn={band.sell_price === null} />
        <Cell label="枚数（理論値）" value={String(stock)} strong warn={stock < 0} />
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
          枚数を直す
        </Button>
      </div>
      {stock < 0 ? <p className="mt-2 text-xs text-amber-700">記録より多く売れています。実際の枚数を数えて直してください。</p> : null}
      {open ? (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-muted/50 p-3">
          <label className="text-xs text-muted-foreground">
            実際の枚数
            <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" className="mt-1 h-10 w-24 bg-background text-right" />
          </label>
          <label className="flex-1 text-xs text-muted-foreground">
            理由
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="開店時の初期枚数、数え直し など" className="mt-1 h-10 bg-background" />
          </label>
          <Button type="button" onClick={save} disabled={pending} className="h-10">
            枚数を確定
          </Button>
        </div>
      ) : null}
    </li>
  )
}

function Cell({ label, value, strong, warn }: { label: string; value: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className="whitespace-nowrap text-right text-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`tabular-nums ${strong ? 'text-lg font-bold' : ''} ${warn ? 'text-amber-700' : ''}`}>{value}</div>
    </div>
  )
}

function ManualForm({ ranks, onDone }: { ranks: ConditionRank[]; onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [model, setModel] = useState('')
  const [rank, setRank] = useState('')
  const [cost, setCost] = useState('')
  const [price, setPrice] = useState('')
  const [qty, setQty] = useState('1')
  const activeRanks = useMemo(() => ranks.filter((r) => r.is_active), [ranks])

  function submit() {
    if (!name.trim()) return toast.error('商品名を入力してください')
    const c = cost.trim() === '' ? 0 : toInt(cost)
    const q = toInt(qty)
    const p = price.trim() === '' ? null : toInt(price)
    if (!Number.isFinite(c) || c < 0) return toast.error('仕入単価を確認してください')
    if (!Number.isFinite(q) || q < 1) return toast.error('数量を 1 以上で入力してください')
    if (p !== null && (!Number.isFinite(p) || p < 0)) return toast.error('売価を確認してください')
    startTransition(async () => {
      const res = await addManualInventory({ name, modelNumber: model, conditionRank: rank, cost: c, salePrice: p, quantity: q })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`入庫しました（${res.barcode}）${p === null ? '。売価が空なので振分待ちに入れました' : ''}`)
      onDone()
    })
  }

  return (
    <section className="rounded-2xl border bg-card p-4">
      <h2 className="mb-1 font-bold">手入力で入庫</h2>
      <p className="mb-3 text-xs text-muted-foreground">買取以外で仕入れた物や、棚で見つかった物を在庫に入れます。買い取った物は支払いが終わると自動で入るので、ここでの入力は要りません。</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[200px] flex-1 text-xs text-muted-foreground">
          商品名
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-10" />
        </label>
        <label className="text-xs text-muted-foreground">
          型番
          <Input value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 h-10 w-28" />
        </label>
        <label className="text-xs text-muted-foreground">
          ランク
          <select value={rank} onChange={(e) => setRank(e.target.value)} className="mt-1 block h-10 rounded-md border bg-background px-2 text-sm">
            <option value="">なし</option>
            {activeRanks.map((r) => (
              <option key={r.id} value={r.code}>
                {r.code} {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          仕入単価
          <Input value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="0" className="mt-1 h-10 w-24 text-right" />
        </label>
        <label className="text-xs text-muted-foreground">
          売価（税込）
          <Input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="後で" className="mt-1 h-10 w-24 text-right" />
        </label>
        <label className="text-xs text-muted-foreground">
          数量
          <Input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" className="mt-1 h-10 w-20 text-right" />
        </label>
        <Button type="button" onClick={submit} disabled={pending} className="h-10">
          入庫する
        </Button>
      </div>
    </section>
  )
}
