'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
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
} from 'recharts'
import type { Category, Subcategory, Product, ProductPriceHistory } from '@/types/database'

type HistoryWithRelations = ProductPriceHistory & {
  product: {
    id: string
    name: string
    category_id: string
    subcategory_id: string | null
    category: Category
    subcategory: Subcategory | null
  }
}

type ProductWithRelations = Product & {
  category: Category
  subcategory: Subcategory | null
}

type BuybackRecord = {
  product_name: string
  unit_price: number
  inspected_quantity: number
  order_date: string
  order_number: string
}

type BuybackProductSummary = {
  product_name: string
  records: BuybackRecord[]
  total_quantity: number
  total_cost: number
}

type ChartRecord = {
  label: string
  unit_price: number
  quantity: number
}

export default function PriceHistoryPage() {
  const [history, setHistory] = useState<HistoryWithRelations[]>([])
  const [products, setProducts] = useState<ProductWithRelations[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [buybackSummary, setBuybackSummary] = useState<BuybackProductSummary[]>([])
  const [selectedBuybackProduct, setSelectedBuybackProduct] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterSubcategory, setFilterSubcategory] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })

  const supabase = createClient()

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const [historyRes, productsRes, categoriesRes, subcategoriesRes, orderItemsRes] = await Promise.all([
        supabase
          .from('product_price_history')
          .select('*, product:products(id, name, category_id, subcategory_id, category:categories(*), subcategory:subcategories(*))')
          .order('changed_at', { ascending: false }),
        supabase
          .from('products')
          .select('*, category:categories(*), subcategory:subcategories(*)')
          .eq('is_active', true)
          .order('sort_order'),
        supabase
          .from('categories')
          .select('*')
          .order('sort_order'),
        supabase
          .from('subcategories')
          .select('*')
          .order('sort_order'),
        supabase
          .from('order_items')
          .select('product_name, unit_price, quantity, inspected_quantity, order:orders(order_number, created_at, status)'),
      ])

      if (historyRes.error) throw historyRes.error
      if (productsRes.error) throw productsRes.error
      if (categoriesRes.error) throw categoriesRes.error
      if (subcategoriesRes.error) throw subcategoriesRes.error
      if (orderItemsRes.error) throw orderItemsRes.error

      setHistory(historyRes.data as unknown as HistoryWithRelations[])
      setProducts(productsRes.data as unknown as ProductWithRelations[])
      setCategories(categoriesRes.data)
      setSubcategories(subcategoriesRes.data)

      // 商品名でグルーピングし、各レコードに日付情報を保持
      const productMap = new Map<string, BuybackProductSummary>()
      for (const item of orderItemsRes.data) {
        const order = item.order as unknown as { order_number: string; created_at: string; status: string } | null
        if (!order) continue
        // 検品完了・振込済・振込確認済のみ対象
        if (!['検品完了', '振込済', '振込確認済'].includes(order.status)) continue

        // inspected_quantityがあればそれを使い、なければquantityをフォールバック
        const qty = item.inspected_quantity ?? item.quantity
        if (!qty || qty <= 0) continue

        const record: BuybackRecord = {
          product_name: item.product_name,
          unit_price: item.unit_price,
          inspected_quantity: qty,
          order_date: order.created_at.split('T')[0],
          order_number: order.order_number,
        }

        const existing = productMap.get(item.product_name)
        if (existing) {
          existing.records.push(record)
          existing.total_quantity += qty
          existing.total_cost += item.unit_price * qty
        } else {
          productMap.set(item.product_name, {
            product_name: item.product_name,
            records: [record],
            total_quantity: qty,
            total_cost: item.unit_price * qty,
          })
        }
      }
      // 日付降順でソート
      for (const summary of productMap.values()) {
        summary.records.sort((a, b) => b.order_date.localeCompare(a.order_date))
      }
      setBuybackSummary(
        Array.from(productMap.values()).sort((a, b) => b.total_quantity - a.total_quantity)
      )
    } catch (error) {
      toast.error('データの取得に失敗しました')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  // カテゴリに連動したサブカテゴリ
  const filteredSubcategories = useMemo(() => {
    if (filterCategory === 'all') return subcategories
    return subcategories.filter((s) => s.category_id === filterCategory)
  }, [filterCategory, subcategories])

  // カテゴリ変更時にサブカテゴリをリセット
  function handleCategoryChange(value: string) {
    setFilterCategory(value)
    setFilterSubcategory('all')
  }

  // 選択日が今日かどうか
  const isToday = useMemo(() => {
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    return selectedDate === todayStr
  }, [selectedDate])

  // 選択日時点の各商品の価格を計算
  const priceAtDate = useMemo(() => {
    if (isToday) return null

    const targetEnd = new Date(selectedDate + 'T23:59:59')
    const priceMap = new Map<string, number>()

    for (const p of products) {
      const productHistory = history
        .filter((h) => h.product?.id === p.id)
        .sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime())

      if (productHistory.length === 0) {
        priceMap.set(p.id, p.price)
        continue
      }

      const beforeOrOn = productHistory.filter(
        (h) => new Date(h.changed_at) <= targetEnd
      )

      if (beforeOrOn.length > 0) {
        priceMap.set(p.id, beforeOrOn[beforeOrOn.length - 1].new_price)
      } else {
        priceMap.set(p.id, productHistory[0].old_price)
      }
    }

    return priceMap
  }, [products, history, selectedDate, isToday])

  function getDisplayPrice(p: ProductWithRelations): number {
    if (isToday || !priceAtDate) return p.price
    return priceAtDate.get(p.id) ?? p.price
  }

  // フィルタ済み全商品
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (filterCategory !== 'all' && p.category_id !== filterCategory) return false
      if (filterSubcategory !== 'all' && p.subcategory_id !== filterSubcategory) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [products, filterCategory, filterSubcategory, search])

  // カテゴリ別にグルーピング
  const groupedProducts = useMemo(() => {
    const groups = new Map<string, { category: Category; items: ProductWithRelations[] }>()
    for (const p of filteredProducts) {
      const catId = p.category_id
      if (!groups.has(catId)) {
        groups.set(catId, { category: p.category, items: [] })
      }
      groups.get(catId)!.items.push(p)
    }
    return Array.from(groups.values()).sort(
      (a, b) => (a.category.sort_order ?? 0) - (b.category.sort_order ?? 0)
    )
  }, [filteredProducts])

  function formatPrice(price: number) {
    return price.toLocaleString('ja-JP')
  }

  // CSVエクスポート（選択日時点の全商品価格）
  const handleCsvExport = useCallback(() => {
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
  }, [filteredProducts, selectedDate, priceAtDate, isToday])

  if (loading) {
    return (
      <div className="space-y-6">
        <AdminHeader title="買取価格一覧" description="全商品の買取価格を確認・エクスポートできます" />
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AdminHeader title="買取価格一覧" description="全商品の買取価格を確認・エクスポートできます" />

      {/* フィルタ */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
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

        <Select value={filterSubcategory} onValueChange={setFilterSubcategory}>
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
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* 買取実績グラフ */}
      {buybackSummary.length > 0 && (() => {
        const selected = buybackSummary.find((d) => d.product_name === selectedBuybackProduct)
        // 選択商品の取引を日付昇順で棒グラフ用データに変換
        const chartData: ChartRecord[] = selected
          ? selected.records
              .slice()
              .sort((a, b) => a.order_date.localeCompare(b.order_date))
              .map((r) => ({
                label: `${r.order_date}  ¥${r.unit_price.toLocaleString()}`,
                unit_price: r.unit_price,
                quantity: r.inspected_quantity,
              }))
          : []

        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                買取実績グラフ
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 商品選択 */}
              <Select value={selectedBuybackProduct} onValueChange={setSelectedBuybackProduct}>
                <SelectTrigger className="w-full sm:w-[400px]">
                  <SelectValue placeholder="商品を選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {buybackSummary.map((d) => (
                    <SelectItem key={d.product_name} value={d.product_name}>
                      {d.product_name}（{d.total_quantity}個）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selected && (
                <>
                  {/* 棒グラフ: X軸=日付+単価、Y軸=数量 */}
                  <div style={{ width: '100%', height: Math.max(300, chartData.length * 50) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartData}
                        layout="vertical"
                        margin={{ top: 5, right: 50, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" allowDecimals={false} label={{ value: '数量（個）', position: 'insideBottomRight', offset: -5 }} />
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
                        <Bar dataKey="quantity" fill="hsl(220, 70%, 55%)" radius={[0, 4, 4, 0]} />
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
                      {selected.records.map((r, i) => (
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
                        <TableCell className="text-right tabular-nums">{selected.total_quantity}個</TableCell>
                        <TableCell className="text-right tabular-nums">¥{selected.total_cost.toLocaleString()}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </>
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
          <Button variant="outline" size="sm" onClick={handleCsvExport} disabled={filteredProducts.length === 0}>
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
                    <>
                      <TableRow key={`cat-${group.category.id}`}>
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
                            ¥{formatPrice(getDisplayPrice(p))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
