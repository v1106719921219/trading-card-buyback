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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
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

const LINE_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea',
  '#0891b2', '#e11d48', '#65a30d', '#c026d3', '#ea580c',
]

export default function PriceHistoryPage() {
  const [history, setHistory] = useState<HistoryWithRelations[]>([])
  const [products, setProducts] = useState<ProductWithRelations[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterSubcategory, setFilterSubcategory] = useState<string>('all')
  const [search, setSearch] = useState('')

  const supabase = createClient()

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const [historyRes, productsRes, categoriesRes, subcategoriesRes] = await Promise.all([
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
      ])

      if (historyRes.error) throw historyRes.error
      if (productsRes.error) throw productsRes.error
      if (categoriesRes.error) throw categoriesRes.error
      if (subcategoriesRes.error) throw subcategoriesRes.error

      setHistory(historyRes.data as unknown as HistoryWithRelations[])
      setProducts(productsRes.data as unknown as ProductWithRelations[])
      setCategories(categoriesRes.data)
      setSubcategories(subcategoriesRes.data)
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
    // カテゴリの sort_order 順
    return Array.from(groups.values()).sort(
      (a, b) => (a.category.sort_order ?? 0) - (b.category.sort_order ?? 0)
    )
  }, [filteredProducts])

  // フィルタ済み履歴（グラフ用）
  const filteredHistory = useMemo(() => {
    return history.filter((h) => {
      if (!h.product) return false
      if (filterCategory !== 'all' && h.product.category_id !== filterCategory) return false
      if (filterSubcategory !== 'all' && h.product.subcategory_id !== filterSubcategory) return false
      if (search && !h.product.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [history, filterCategory, filterSubcategory, search])

  // グラフ用データ: 商品ごとに価格推移をまとめる
  const chartData = useMemo(() => {
    const productIds = [...new Set(filteredHistory.map((h) => h.product?.id).filter(Boolean))]
    const topProductIds = productIds.slice(0, 10)

    const productNameMap = new Map<string, string>()
    filteredHistory.forEach((h) => {
      if (h.product && topProductIds.includes(h.product.id)) {
        productNameMap.set(h.product.id, h.product.name)
      }
    })

    const dateMap = new Map<string, Record<string, number>>()

    const sorted = filteredHistory
      .filter((h) => h.product && topProductIds.includes(h.product.id))
      .sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime())

    sorted.forEach((h) => {
      const date = new Date(h.changed_at).toLocaleDateString('ja-JP', {
        month: 'short',
        day: 'numeric',
      })
      const productName = h.product!.name

      if (!dateMap.has(date)) {
        dateMap.set(date, {})
      }
      const entry = dateMap.get(date)!
      if (!(productName in entry)) {
        entry[productName] = h.old_price
      }
      entry[productName] = h.new_price
    })

    const result = Array.from(dateMap.entries()).map(([date, prices]) => ({
      date,
      ...prices,
    }))

    return {
      data: result,
      productNames: Array.from(productNameMap.values()),
    }
  }, [filteredHistory])

  function formatPrice(price: number) {
    return price.toLocaleString('ja-JP')
  }

  // CSVエクスポート（全商品の現在価格）
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
      p.price.toString(),
    ])

    const csvContent = [header, ...rows]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const bom = '\uFEFF'
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const now = new Date()
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    link.download = `買取価格一覧_${dateStr}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [filteredProducts])

  if (loading) {
    return (
      <div className="space-y-6">
        <AdminHeader title="価格履歴" description="全商品の買取価格一覧と価格推移を確認できます" />
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AdminHeader title="価格履歴" description="全商品の買取価格一覧と価格推移を確認できます" />

      {/* フィルタ */}
      <div className="flex flex-col sm:flex-row gap-3">
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

      {/* グラフ */}
      {chartData.data.length > 0 && chartData.productNames.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">価格推移グラフ</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={chartData.data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis
                  fontSize={12}
                  tickFormatter={(v) => `¥${v.toLocaleString()}`}
                />
                <Tooltip
                  formatter={(value: number | undefined) => [`¥${(value ?? 0).toLocaleString()}`, '']}
                  labelFormatter={(label) => `日付: ${label}`}
                />
                <Legend />
                {chartData.productNames.map((name, i) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={LINE_COLORS[i % LINE_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* 全商品買取価格一覧 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            買取価格一覧
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
                            ¥{formatPrice(p.price)}
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
