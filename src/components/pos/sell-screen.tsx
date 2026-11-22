'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Minus, Plus, ScanLine, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { completeSale, findSellable, type SellableHit } from '@/actions/pos-sales'
import { formatYen } from '@/lib/pos-buyback'
import { addToCart, cartKey, cartTotals, changeDue, daysSince, setCartQuantity, toSaleLines, type CartLine } from '@/lib/pos-sales'
import type { PriceBand } from '@/types/database'

/**
 * 販売（docs/pos/design.md 3.2 節）。
 * 左: スキャン／検索と価格帯ボタン。右: カート・合計（内税）・預り金・おつり。
 * 「価格確認」に切り替えると、スキャンした在庫の売価だけを表示してカートには入れない。
 */
export function SellScreen({ bands, registerOpen }: { bands: PriceBand[]; registerOpen: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'sell' | 'check'>('sell')
  const [hits, setHits] = useState<SellableHit[] | null>(null)
  const [checked, setChecked] = useState<SellableHit | null>(null)
  const [cart, setCart] = useState<CartLine[]>([])
  const [tendered, setTendered] = useState('')
  // 会計 1 回につき 1 つの ID。通信の再送があっても二重会計にならない
  const [saleId, setSaleId] = useState(() => crypto.randomUUID())

  const { count, total, tax } = cartTotals(cart)
  const tenderedNum = tendered.trim() === '' ? NaN : Number(tendered)
  const change = Number.isInteger(tenderedNum) ? changeDue(total, tenderedNum) : null

  function put(line: CartLine) {
    const res = addToCart(cart, line)
    if ('error' in res) return toast.error(res.error)
    setCart(res.lines)
  }

  function addHit(h: SellableHit) {
    if (h.sale_price === null) return toast.error(`「${h.name}」は売価が未設定です。在庫画面で売価を付けてください`)
    put({
      kind: 'inventory',
      id: h.id,
      name: h.name,
      unitPrice: h.sale_price,
      quantity: 1,
      available: h.quantity,
      detail: [h.model_number, h.condition_rank ? `ランク ${h.condition_rank}` : null, h.psa_cert_number ? `PSA ${h.psa_cert_number}` : null, h.barcode].filter(Boolean).join(' ・ '),
    })
  }

  function addBand(b: PriceBand) {
    if (b.sell_price === null) return toast.error(`価格帯「${b.label}」は売価が未設定です（設定タブで入力）`)
    put({ kind: 'band', id: b.id, name: b.label, unitPrice: b.sell_price, quantity: 1, detail: b.sleeve_color ? `スリーブ: ${b.sleeve_color}` : undefined })
  }

  function search() {
    const q = query.trim()
    if (!q) return
    startTransition(async () => {
      const res = await findSellable(q)
      if (res.error) {
        toast.error(res.error)
        return
      }
      const items = res.items ?? []
      if (items.length === 0) {
        toast.error(res.byBarcode ? 'このバーコードの在庫は販売できる状態ではありません' : '該当する在庫がありません')
        setHits([])
        setChecked(null)
        return
      }
      if (mode === 'check') {
        setChecked(items[0])
        setHits(items.length > 1 ? items : null)
      } else if (items.length === 1) {
        addHit(items[0])
        setHits(null)
      } else {
        setHits(items)
      }
      if (res.byBarcode || items.length === 1) setQuery('')
      inputRef.current?.focus()
    })
  }

  function changeQty(key: string, qty: number) {
    const res = setCartQuantity(cart, key, qty)
    if ('error' in res) return toast.error(res.error)
    setCart(res.lines)
  }

  function checkout() {
    if (cart.length === 0) return toast.error('カートが空です')
    if (!change || !change.ok) return toast.error('預り金を入力してください')
    startTransition(async () => {
      const res = await completeSale({ saleId, lines: toSaleLines(cart), tendered: tenderedNum })
      if (res.error || !res.saleId) {
        toast.error(res.error ?? '会計を記録できませんでした')
        return
      }
      setCart([])
      setTendered('')
      setSaleId(crypto.randomUUID())
      router.push(`/pos/sell/${res.saleId}?done=1`)
    })
  }

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-lg font-bold">販売</h1>
          <div className="flex rounded-lg border p-0.5 text-sm">
            <button type="button" onClick={() => { setMode('sell'); setChecked(null) }} className={`rounded-md px-3 py-1.5 ${mode === 'sell' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
              カートに入れる
            </button>
            <button type="button" onClick={() => setMode('check')} className={`rounded-md px-3 py-1.5 ${mode === 'check' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
              価格確認
            </button>
          </div>
          <Link href="/pos/history/sales" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            販売の履歴
          </Link>
        </div>

        {!registerOpen ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            レジが開局されていません。会計の前に <Link href="/pos/register" className="font-bold underline">レジ画面</Link> で開局してください（カートに入れることはできます）。
          </div>
        ) : null}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="ラベルをスキャン、または商品名・型番で検索"
              className="h-12 pl-10 text-base"
            />
          </div>
          <Button type="button" onClick={search} disabled={pending} className="h-12">
            <Search className="h-4 w-4" />
            {mode === 'check' ? '確認' : '検索'}
          </Button>
        </div>

        {mode === 'check' && checked ? (
          <div className="rounded-2xl border-2 border-primary/40 bg-card p-5">
            <div className="text-sm text-muted-foreground">価格確認（カートには入れません）</div>
            <div className="mt-1 text-xl font-bold">{checked.name}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {[checked.model_number, checked.condition_rank ? `ランク ${checked.condition_rank}` : null, checked.psa_cert_number ? `PSA ${checked.psa_cert_number}` : null, checked.barcode, `入庫から ${daysSince(checked.created_at)} 日`, `在庫 ${checked.quantity}`]
                .filter(Boolean)
                .join(' ・ ')}
            </div>
            <div className="mt-3 text-4xl font-bold tabular-nums">{checked.sale_price === null ? '売価未設定' : formatYen(checked.sale_price)}</div>
            {checked.sale_price !== null ? (
              <Button type="button" variant="outline" className="mt-3" onClick={() => { addHit(checked); setChecked(null) }}>
                カートに入れる
              </Button>
            ) : null}
          </div>
        ) : null}

        {hits && hits.length > 0 ? (
          <ul className="divide-y rounded-2xl border bg-card">
            {hits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => (mode === 'check' ? setChecked(h) : addHit(h))}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{h.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[h.model_number, h.condition_rank ? `ランク ${h.condition_rank}` : null, h.psa_cert_number ? `PSA ${h.psa_cert_number}` : null, h.barcode, `在庫 ${h.quantity}`].filter(Boolean).join(' ・ ')}
                    </div>
                  </div>
                  <div className="whitespace-nowrap text-lg font-bold tabular-nums">{h.sale_price === null ? <span className="text-sm font-normal text-amber-700">売価未設定</span> : formatYen(h.sale_price)}</div>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <section>
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">価格帯（スリーブの色で会計）</h2>
          {bands.length === 0 ? (
            <p className="text-sm text-muted-foreground">価格帯がありません。設定タブで登録してください。</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {bands.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => addBand(b)}
                  disabled={b.sell_price === null}
                  className="flex min-h-[84px] flex-col items-start justify-center rounded-2xl border bg-card px-4 py-3 text-left hover:bg-muted/40 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="text-sm text-muted-foreground">{b.label}{b.sleeve_color ? ` ・ ${b.sleeve_color}` : ''}</span>
                  <span className="text-2xl font-bold tabular-nums">{b.sell_price === null ? '売価未設定' : formatYen(b.sell_price)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="flex w-full shrink-0 flex-col border-t bg-card lg:w-[380px] lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="font-bold">カート</h2>
          {cart.length > 0 ? (
            <button type="button" onClick={() => setCart([])} className="text-sm text-muted-foreground underline underline-offset-4">
              空にする
            </button>
          ) : null}
        </div>
        <ul className="flex-1 divide-y overflow-y-auto border-y">
          {cart.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">スキャンするか、価格帯を押してください</li>
          ) : (
            cart.map((l) => {
              const key = cartKey(l)
              return (
                <li key={key} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{l.name}</div>
                      {l.detail ? <div className="truncate text-xs text-muted-foreground">{l.detail}</div> : null}
                    </div>
                    <div className="whitespace-nowrap font-bold tabular-nums">{formatYen(l.unitPrice * l.quantity)}</div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => changeQty(key, l.quantity - 1)} aria-label="1 減らす">
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      value={l.quantity}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (e.target.value !== '' && Number.isInteger(n) && n > 0) changeQty(key, n)
                      }}
                      inputMode="numeric"
                      className="h-9 w-16 text-center tabular-nums"
                      aria-label="数量"
                    />
                    <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => changeQty(key, l.quantity + 1)} aria-label="1 増やす">
                      <Plus className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground">× {formatYen(l.unitPrice)}</span>
                    <Button type="button" variant="ghost" size="icon" className="ml-auto h-9 w-9 text-muted-foreground" onClick={() => changeQty(key, 0)} aria-label="カートから外す">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              )
            })
          )}
        </ul>
        <div className="space-y-3 p-4">
          <div className="flex items-end justify-between">
            <span className="text-sm text-muted-foreground">合計（{count} 点・税込）</span>
            <span className="text-3xl font-bold tabular-nums">{formatYen(total)}</span>
          </div>
          <div className="text-right text-xs text-muted-foreground">うち消費税（10%）{formatYen(tax)}</div>
          <label className="block text-sm">
            <span className="text-muted-foreground">預り金</span>
            <Input value={tendered} onChange={(e) => setTendered(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="0" className="mt-1 h-12 text-right text-xl tabular-nums" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setTendered(String(total))} disabled={total === 0}>
              ちょうど
            </Button>
            {[1000, 5000, 10000].map((n) => (
              <Button key={n} type="button" variant="outline" size="sm" onClick={() => setTendered(String((Number(tendered) || 0) + n))}>
                +{n.toLocaleString('ja-JP')}
              </Button>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={() => setTendered('')}>
              クリア
            </Button>
          </div>
          <div className="flex items-end justify-between rounded-xl bg-muted/50 px-4 py-3">
            <span className="text-sm text-muted-foreground">{change && !change.ok && total > 0 ? '不足' : 'おつり'}</span>
            <span className={`text-4xl font-bold tabular-nums ${change && !change.ok && total > 0 ? 'text-red-600' : ''}`}>
              {change ? formatYen(change.ok ? change.change : change.short) : '—'}
            </span>
          </div>
          <Button type="button" onClick={checkout} disabled={pending || cart.length === 0 || !change || !change.ok || !registerOpen} className="h-14 w-full text-lg">
            会計する
          </Button>
        </div>
      </aside>
    </div>
  )
}
