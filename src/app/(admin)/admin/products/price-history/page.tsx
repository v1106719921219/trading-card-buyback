'use client'
import { fetchAllById, fetchAllUuidRows } from '@/lib/fetch-all-rows'

import { useEffect, useState, useMemo, useCallback, useRef, Fragment } from 'react'
import { AdminHeader } from '@/components/admin/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Search, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts'
import { jstDate, pricesAtJstDate } from '@/lib/price-history-view'
import type { Category, Subcategory, Product } from '@/types/database'

type HistoryWithRelations = { id: string; product_id: string; old_price: number; new_price: number; changed_at: string }
type CatalogProduct = Pick<Product, 'id' | 'name' | 'price' | 'category_id' | 'subcategory_id'>
type ProductWithRelations = CatalogProduct & { category: Category; subcategory: Subcategory | null }

type BuybackRecord = {
  product_name: string
  unit_price: number
  inspected_quantity: number
  order_date: string
  order_number: string
}

type ChartRecord = {
  label: string
  unit_price: number
  quantity: number
}

export default function PriceHistoryPage() {
  const [history, setHistory] = useState<HistoryWithRelations[]>([])
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [selectedBuybackProduct, setSelectedBuybackProduct] = useState<string>('')
  const [buybackRecords, setBuybackRecords] = useState<BuybackRecord[]>([])
  const [buybackLoading, setBuybackLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [catalogReady, setCatalogReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyReady, setHistoryReady] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [historyReload, setHistoryReload] = useState(0)
  const [visibleCount, setVisibleCount] = useState(100)
  const historyStarted = useRef(false)

  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterSubcategory, setFilterSubcategory] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selectedDate, setSelectedDate] = useState(() => jstDate())
  const isToday = selectedDate === jstDate()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError('')
      try {
        const [cats, subs] = await Promise.all([
          supabase.from('categories').select('*').order('sort_order'),
          supabase.from('subcategories').select('*').order('sort_order'),
        ])
        if (cancelled) return
        if (cats.error || subs.error) throw Error('カテゴリを読み込めませんでした')
        setCategories(cats.data ?? [])
        setSubcategories(subs.data ?? [])
        const buffered: CatalogProduct[] = []
        const result = await fetchAllUuidRows<CatalogProduct>((after, size, lower, upper) => {
          let q = supabase.from('products').select('id,name,price,category_id,subcategory_id')
            .eq('is_active', true).order('id').gte('id', lower).limit(size)
          if (upper) q = q.lt('id', upper)
          if (after) q = q.gt('id', after)
          return q
        }, { shouldContinue: () => !cancelled, onBatch: batch => {
          if (cancelled) return
          buffered.push(...batch)
          setProducts([...buffered])
          setLoading(false)
        } })
        if (cancelled) return
        if (result.error || !result.data) throw Error('商品を最後まで読み込めませんでした。再読み込みしてください。')
        setProducts(result.data)
        setCatalogReady(true)
      } catch (e) {
        if (!cancelled) { setLoadError(e instanceof Error ? e.message : '読み込めませんでした'); toast.error('商品の取得に失敗しました') }
      } finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [supabase])

  // 今日の価格には履歴は不要。過去の日付が選ばれたときだけ軽量な価格履歴を取得する。
  const needsHistory = !isToday
  useEffect(() => {
    if (!needsHistory || historyReady || historyStarted.current) return
    historyStarted.current = true
    let cancelled = false
    async function load() {
      setHistoryLoading(true)
      setHistoryError('')
      try {
        const result = await fetchAllById<HistoryWithRelations>((after, size) => {
          let q = supabase.from('product_price_history').select('id,product_id,old_price,new_price,changed_at').order('id').limit(size)
          if (after) q = q.gt('id', after)
          return q
        })
        if (cancelled) return
        if (result.error || !result.data) throw Error('過去価格を取得できませんでした')
        setHistory(result.data)
        setHistoryReady(true)
      } catch {
        if (!cancelled) { setHistoryError('過去価格を取得できませんでした。日付を選び直して再試行してください。'); historyStarted.current = false }
      } finally { if (!cancelled) setHistoryLoading(false) }
    }
    void load()
    return () => { cancelled = true; historyStarted.current = false }
  }, [needsHistory, supabase, historyReload, historyReady])

  const displayProducts = useMemo<ProductWithRelations[]>(() => {
    const cats = new Map(categories.map(c => [c.id, c])), subs = new Map(subcategories.map(s => [s.id, s]))
    return products.flatMap(p => {
      const category = cats.get(p.category_id)
      return category ? [{ ...p, category, subcategory: p.subcategory_id ? subs.get(p.subcategory_id) ?? null : null }] : []
    })
  }, [products, categories, subcategories])
  const pricesReady = isToday || historyReady
  // 商品選択時にその商品の買取データを取得
  async function fetchBuybackData(productName: string) {
    setSelectedBuybackProduct(productName)
    if (!productName) {
      setBuybackRecords([])
      return
    }
    setBuybackLoading(true)
    try {
      // 全件取得（1000件ずつ）
      const PAGE_SIZE = 1000
      let all: { product_name: string; unit_price: number; quantity: number; inspected_quantity: number | null; order: unknown }[] = []
      let offset = 0
      let hasMore = true
      while (hasMore) {
        const res = await supabase
          .from('order_items')
          .select('product_name, unit_price, quantity, inspected_quantity, order:orders(order_number, created_at, status)')
          .eq('product_name', productName)
          .range(offset, offset + PAGE_SIZE - 1)
        if (res.error) throw res.error
        all = [...all, ...res.data]
        hasMore = res.data.length === PAGE_SIZE
        offset += PAGE_SIZE
      }

      const records: BuybackRecord[] = []
      for (const item of all) {
        const order = item.order as { order_number: string; created_at: string; status: string } | null
        if (!order) continue
        if (!['検品完了', '振込済', '振込確認済'].includes(order.status)) continue
        const qty = item.inspected_quantity ?? item.quantity
        if (!qty || qty <= 0) continue
        records.push({
          product_name: item.product_name,
          unit_price: item.unit_price,
          inspected_quantity: qty,
          order_date: jstDate(new Date(order.created_at)),
          order_number: order.order_number,
        })
      }
      records.sort((a, b) => b.order_date.localeCompare(a.order_date))
      setBuybackRecords(records)
    } catch (error) {
      toast.error('買取データの取得に失敗しました')
      console.error(error)
    } finally {
      setBuybackLoading(false)
    }
  }

  // カテゴリに連動したサブカテゴリ
  const filteredSubcategories = useMemo(() => {
    if (filterCategory === 'all') return subcategories
    return subcategories.filter((s) => s.category_id === filterCategory)
  }, [filterCategory, subcategories])

  // カテゴリ変更時にサブカテゴリをリセット
  function handleCategoryChange(value: string) {
    setVisibleCount(100)
    setFilterCategory(value)
    setFilterSubcategory('all')
  }

  const priceAtDate = useMemo(() => isToday || !historyReady ? null : pricesAtJstDate(products, history, selectedDate), [products, history, selectedDate, isToday, historyReady])

  const getDisplayPrice = useCallback((p: ProductWithRelations): number => {
    if (isToday || !priceAtDate) return p.price
    return priceAtDate.get(p.id) ?? p.price
  }, [isToday, priceAtDate])

  // フィルタ済み全商品
  const filteredProducts = useMemo(() => {
    return displayProducts.filter((p) => {
      if (filterCategory !== 'all' && p.category_id !== filterCategory) return false
      if (filterSubcategory !== 'all' && p.subcategory_id !== filterSubcategory) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [displayProducts, filterCategory, filterSubcategory, search])

  // カテゴリ別にグルーピング
  const groupedProducts = useMemo(() => {
    const groups = new Map<string, { category: Category; items: ProductWithRelations[] }>()
    for (const p of filteredProducts.slice(0, visibleCount)) {
      const catId = p.category_id
      if (!groups.has(catId)) {
        groups.set(catId, { category: p.category, items: [] })
      }
      groups.get(catId)!.items.push(p)
    }
    return Array.from(groups.values()).sort(
      (a, b) => (a.category.sort_order ?? 0) - (b.category.sort_order ?? 0)
    )
  }, [filteredProducts, visibleCount])

  function formatPrice(price: number) {
    return price.toLocaleString('ja-JP')
  }

  // CSVエクスポート（選択日時点の全商品価格）
  const handleCsvExport = useCallback(() => {
    if (!catalogReady || !pricesReady) { toast.error('全件の読み込み完了後に出力できます'); return }
    if (filteredProducts.length === 0) {
      toast.error('エクスポートするデータがありません')
      return
    }

    const header = ['商品名', 'カテゴリ', 'サブカテゴリ', '買取価格']
    const rows = filteredProducts.map((p) => [
      p.name,
      p.category?.name ?? '',
      p.subcategory?.name ?? '',
      getDisplayPrice(p).toString(),
    ])

    const csvContent = [header, ...rows]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const bom = '\uFEFF'
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const fileDateStr = selectedDate.replace(/-/g, '')
    link.download = `買取価格一覧_${fileDateStr}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [filteredProducts, selectedDate, getDisplayPrice, catalogReady, pricesReady])


  return (
    <div className="space-y-6">
      <AdminHeader title="買取価格一覧" description="全商品の買取価格を確認・エクスポートできます" />

      {loadError ? <p role="alert" className="text-red-600">{loadError}</p> : !catalogReady && <p role="status" className="text-sm text-muted-foreground">{loading ? '商品を読み込み中…' : `商品を順次読み込み中（${products.length.toLocaleString('ja-JP')}件取得済み）。検索結果は読み込み済みの商品が対象です。CSV出力は全件そろってから利用できます。`}</p>}
      {historyLoading && !isToday && <p role="status" className="text-sm text-muted-foreground">選択した日付の価格を取得中…</p>}
      {historyError && !isToday && <div role="alert" className="text-red-600">{historyError}<Button variant="outline" onClick={() => { historyStarted.current = false; setHistoryReload(n => n + 1) }}>再試行</Button></div>}
      {/* フィルタ */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => { if (e.target.value) setSelectedDate(e.target.value) }}
          className="w-full sm:w-[180px]"
        />

        <Select value={filterCategory} onValueChange={handleCategoryChange}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="カテゴリ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全カテゴリ</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterSubcategory} onValueChange={v => { setVisibleCount(100); setFilterSubcategory(v) }}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="サブカテゴリ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全サブカテゴリ</SelectItem>
            {filteredSubcategories.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="商品名で検索..."
            value={search}
            onChange={(e) => { setVisibleCount(100); setSearch(e.target.value) }}
            className="pl-9"
          />
        </div>
      </div>

      {/* 買取実績グラフ */}
      {(() => {
        const buybackSearch = selectedBuybackProduct.toLowerCase()
        const suggestions = buybackSearch.length >= 1
          ? products.filter((p) => p.name.toLowerCase().includes(buybackSearch)).slice(0, 10)
          : []
        const hasExactMatch = products.some((p) => p.name === selectedBuybackProduct)

        const chartData: ChartRecord[] = buybackRecords.map((r) => ({
          label: `${r.order_date}  ¥${r.unit_price.toLocaleString()}  ${r.order_number}`,
          unit_price: r.unit_price,
          quantity: r.inspected_quantity,
        }))
        const totalQty = buybackRecords.reduce((s, r) => s + r.inspected_quantity, 0)
        const totalCost = buybackRecords.reduce((s, r) => s + r.unit_price * r.inspected_quantity, 0)

        // 直近N個の加重平均仕入れ単価を計算
        function calcRecentAvg(n: number): { avg: number; actual: number } | null {
          if (totalQty === 0) return null
          let remaining = n
          let cost = 0
          let counted = 0
          for (const r of buybackRecords) {
            const take = Math.min(remaining, r.inspected_quantity)
            cost += r.unit_price * take
            counted += take
            remaining -= take
            if (remaining <= 0) break
          }
          if (counted === 0) return null
          return { avg: Math.round(cost / counted), actual: counted }
        }

        const recent10 = calcRecentAvg(10)
        const recent50 = calcRecentAvg(50)
        const recent100 = calcRecentAvg(100)

        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">買取実績グラフ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 商品検索 */}
              <div className="relative w-full sm:w-[400px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="商品名を入力して検索..."
                  value={selectedBuybackProduct}
                  onChange={(e) => {
                    setSelectedBuybackProduct(e.target.value)
                    setBuybackRecords([])
                  }}
                  className="pl-9"
                />
                {/* サジェスト */}
                {suggestions.length > 0 && !hasExactMatch && (
                  <div className="absolute z-10 mt-1 w-full bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {suggestions.map((p) => (
                      <button
                        key={p.id}
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                        onClick={() => fetchBuybackData(p.name)}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {buybackLoading && (
                <p className="text-center text-muted-foreground py-8">読み込み中...</p>
              )}

              {!buybackLoading && buybackRecords.length > 0 && (
                <>
                  {/* 直近N個の仕入れ単価カード */}
                  <div className="grid gap-4 grid-cols-3">
                    {[
                      { label: '直近10個', data: recent10, target: 10 },
                      { label: '直近50個', data: recent50, target: 50 },
                      { label: '直近100個', data: recent100, target: 100 },
                    ].map(({ label, data, target }) => (
                      <Card key={label}>
                        <CardContent className="pt-4 pb-3">
                          <p className="text-xs text-muted-foreground">{label}の仕入れ単価</p>
                          {data ? (
                            <>
                              <p className="text-xl font-bold tabular-nums mt-1">
                                ¥{data.avg.toLocaleString()}
                              </p>
                              {data.actual < target && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  ※{data.actual}個のデータで算出
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground mt-1">データなし</p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* 棒グラフ: Y軸=日付+単価、バー=数量、棒の右に個数表示 */}
                  <div style={{ width: '100%', height: Math.max(300, chartData.length * 40) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartData}
                        layout="vertical"
                        margin={{ top: 5, right: 60, left: 20, bottom: 25 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" allowDecimals={false} label={{ value: '数量（個）', position: 'insideBottom', offset: -15 }} />
                        <YAxis
                          type="category"
                          dataKey="label"
                          width={160}
                          tick={{ fontSize: 11 }}
                        />
                        <RechartsTooltip
                          formatter={(value: number | undefined) => [`${value ?? 0}個`, '数量']}
                          labelFormatter={(label: unknown) => {
                            const labelStr = String(label)
                            const item = chartData.find((d) => d.label === labelStr)
                            if (!item) return labelStr
                            return `${labelStr} × ${item.quantity}個 = ¥${(item.unit_price * item.quantity).toLocaleString()}`
                          }}
                        />
                        <Bar dataKey="quantity" fill="hsl(220, 70%, 55%)" radius={[0, 4, 4, 0]}>
                          <LabelList dataKey="quantity" position="right" fontSize={11} formatter={(v: unknown) => `${v}個`} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* 明細テーブル */}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>日付</TableHead>
                        <TableHead>注文番号</TableHead>
                        <TableHead className="text-right">買取単価</TableHead>
                        <TableHead className="text-right">数量</TableHead>
                        <TableHead className="text-right">小計</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {buybackRecords.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell>{r.order_date}</TableCell>
                          <TableCell className="font-mono text-xs">{r.order_number}</TableCell>
                          <TableCell className="text-right tabular-nums">¥{r.unit_price.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.inspected_quantity}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">¥{(r.unit_price * r.inspected_quantity).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-medium">
                        <TableCell colSpan={3} className="text-right">合計</TableCell>
                        <TableCell className="text-right tabular-nums">{totalQty}個</TableCell>
                        <TableCell className="text-right tabular-nums">¥{totalCost.toLocaleString()}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </>
              )}

              {!buybackLoading && hasExactMatch && buybackRecords.length === 0 && (
                <p className="text-center text-muted-foreground py-8">この商品の買取実績はありません</p>
              )}
            </CardContent>
          </Card>
        )
      })()}

      {/* 全商品買取価格一覧 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            買取価格一覧
            {!isToday && (
              <span className="text-primary text-sm ml-2">
                {selectedDate.replace(/-/g, '/')} 時点
              </span>
            )}
            <span className="text-muted-foreground font-normal text-sm ml-2">
              （{filteredProducts.length}商品）
            </span>
          </CardTitle>
          <Button variant="outline" size="sm" onClick={handleCsvExport} disabled={!catalogReady || !pricesReady || filteredProducts.length === 0}>
            <Download className="mr-1 h-4 w-4" />
            CSVエクスポート
          </Button>
        </CardHeader>
        <CardContent>
          {filteredProducts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              商品がありません
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>商品名</TableHead>
                    <TableHead>サブカテゴリ</TableHead>
                    <TableHead className="text-right">買取価格</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedProducts.map((group) => (
                    <Fragment key={group.category.id}>
                      <TableRow>
                        <TableCell colSpan={3} className="bg-muted/50 py-2 px-4 font-medium text-sm">
                          {group.category.name}
                          <span className="text-muted-foreground font-normal ml-2">
                            （{group.items.length}件）
                          </span>
                        </TableCell>
                      </TableRow>
                      {group.items.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>
                            {p.subcategory && (
                              <Badge variant="secondary">{p.subcategory.name}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {pricesReady ? `¥${formatPrice(getDisplayPrice(p))}` : historyError ? '取得失敗' : '取得中…'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between pt-4 text-sm text-muted-foreground">
                <span>{filteredProducts.length.toLocaleString('ja-JP')}件中 {Math.min(visibleCount, filteredProducts.length).toLocaleString('ja-JP')}件表示</span>
                {visibleCount < filteredProducts.length && <Button variant="outline" onClick={() => setVisibleCount(n => n + 100)}>次の100件を表示</Button>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
