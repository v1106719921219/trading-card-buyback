'use client'

import { useEffect, useState, useMemo } from 'react'
import { AdminHeader } from '@/components/admin/header'
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
import { Search } from 'lucide-react'
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
import type { Category, Subcategory, ProductPriceHistory } from '@/types/database'

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

const LINE_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea',
  '#0891b2', '#e11d48', '#65a30d', '#c026d3', '#ea580c',
]

export default function PriceHistoryPage() {
  const [history, setHistory] = useState<HistoryWithRelations[]>([])
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
      const [historyRes, categoriesRes, subcategoriesRes] = await Promise.all([
        supabase
          .from('product_price_history')
          .select('*, product:products(id, name, category_id, subcategory_id, category:categories(*), subcategory:subcategories(*))')
          .order('changed_at', { ascending: false }),
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
      if (categoriesRes.error) throw categoriesRes.error
      if (subcategoriesRes.error) throw subcategoriesRes.error

      setHistory(historyRes.data as unknown as HistoryWithRelations[])
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

  // フィルタ済み履歴
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
    // フィルタ済みの商品IDを収集（最大10商品）
    const productIds = [...new Set(filteredHistory.map((h) => h.product?.id).filter(Boolean))]
    const topProductIds = productIds.slice(0, 10)

    // 商品名マップ
    const productNameMap = new Map<string, string>()
    filteredHistory.forEach((h) => {
      if (h.product && topProductIds.includes(h.product.id)) {
        productNameMap.set(h.product.id, h.product.name)
      }
    })

    // 日付ごとにデータをまとめる
    const dateMap = new Map<string, Record<string, number>>()

    // 古い順にソートして処理
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
      // 変更前の値がなければ旧価格をセット、変更後の新価格で上書き
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

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function formatPrice(price: number) {
    return price.toLocaleString('ja-JP')
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <AdminHeader title="価格履歴" description="商品の買取価格の変更履歴を確認できます" />
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AdminHeader title="価格履歴" description="商品の買取価格の変更履歴を確認できます" />

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

      {/* 一覧テーブル */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">変更履歴一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredHistory.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              価格変更の履歴がありません
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>変更日時</TableHead>
                    <TableHead>商品名</TableHead>
                    <TableHead>カテゴリ</TableHead>
                    <TableHead className="text-right">旧価格</TableHead>
                    <TableHead className="text-right">新価格</TableHead>
                    <TableHead className="text-right">差額</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.map((h) => {
                    const diff = h.new_price - h.old_price
                    return (
                      <TableRow key={h.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatDate(h.changed_at)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {h.product?.name ?? '(削除済み)'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {h.product?.category && (
                              <Badge variant="outline">{h.product.category.name}</Badge>
                            )}
                            {h.product?.subcategory && (
                              <Badge variant="secondary">{h.product.subcategory.name}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          ¥{formatPrice(h.old_price)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          ¥{formatPrice(h.new_price)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className={diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : ''}>
                            {diff > 0 ? '+' : ''}{formatPrice(diff)}円
                          </span>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
