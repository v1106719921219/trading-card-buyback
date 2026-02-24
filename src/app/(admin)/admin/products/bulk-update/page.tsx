'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminHeader } from '@/components/admin/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { ArrowLeft, Save, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Category, Product, Subcategory } from '@/types/database'

interface EditableProduct extends Product {
  category: Category
  newPrice: number
  changed: boolean
}

export default function BulkUpdatePage() {
  const [products, setProducts] = useState<EditableProduct[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterSubcategory, setFilterSubcategory] = useState<string>('all')
  const [search, setSearch] = useState('')

  const supabase = createClient()

  async function fetchData() {
    const [prodResult, catResult, subResult] = await Promise.all([
      supabase.from('products').select('*, category:categories(*), subcategory:subcategories(*)').eq('is_active', true).order('sort_order'),
      supabase.from('categories').select('*').order('sort_order'),
      supabase.from('subcategories').select('*').eq('is_active', true).order('sort_order'),
    ])

    if (prodResult.data) {
      const sorted = [...prodResult.data].sort((a: any, b: any) => {
        const catA = a.category?.sort_order ?? 0
        const catB = b.category?.sort_order ?? 0
        if (catA !== catB) return catA - catB
        return (a.sort_order ?? 0) - (b.sort_order ?? 0)
      })
      setProducts(
        (sorted as (Product & { category: Category; subcategory: Subcategory | null })[]).map((p) => ({
          ...p,
          newPrice: p.price,
          changed: false,
        }))
      )
    }
    if (catResult.data) setCategories(catResult.data)
    if (subResult.data) setSubcategories(subResult.data)
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  function updatePrice(id: string, newPrice: number) {
    setProducts(
      products.map((p) =>
        p.id === id
          ? { ...p, newPrice, changed: newPrice !== p.price }
          : p
      )
    )
  }

  const changedProducts = products.filter((p) => p.changed)

  const filteredSubcategories = subcategories.filter((s) =>
    filterCategory === 'all' ? true : s.category_id === filterCategory
  )

  const filteredProducts = products.filter((p) => {
    const matchesCategory = filterCategory === 'all' || p.category_id === filterCategory
    const matchesSubcategory = filterSubcategory === 'all' || p.subcategory_id === filterSubcategory
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
    return matchesCategory && matchesSubcategory && matchesSearch
  })

  async function handleSave() {
    if (changedProducts.length === 0) return
    setSaving(true)

    for (const product of changedProducts) {
      // 価格が0円の場合は自動的に価格表を非表示にする
      const updateData: Record<string, unknown> = { price: product.newPrice }
      if (product.newPrice === 0) {
        updateData.show_in_price_list = false
      }

      const { error } = await supabase
        .from('products')
        .update(updateData)
        .eq('id', product.id)

      if (error) {
        toast.error(`${product.name}の更新に失敗しました`)
        setSaving(false)
        return
      }
    }

    toast.success(`${changedProducts.length}件の価格を更新しました`)
    setSaving(false)
    fetchData()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/products">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <AdminHeader
          title="一括価格更新"
          description={`${changedProducts.length}件の変更あり`}
          actions={
            <Button
              onClick={handleSave}
              disabled={changedProducts.length === 0 || saving}
            >
              <Save className="mr-2 h-4 w-4" />
              {saving ? '保存中...' : `${changedProducts.length}件を保存`}
            </Button>
          }
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="商品名で検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v); setFilterSubcategory('all') }}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全カテゴリ</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filteredSubcategories.length > 0 && (
          <Select value={filterSubcategory} onValueChange={setFilterSubcategory}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全サブカテゴリ</SelectItem>
              {filteredSubcategories.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>商品名</TableHead>
              <TableHead className="hidden sm:table-cell">カテゴリ</TableHead>
              <TableHead className="text-right">現在価格</TableHead>
              <TableHead className="text-right w-28 sm:w-40">新価格</TableHead>
              <TableHead className="text-right hidden sm:table-cell">差額</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  読み込み中...
                </TableCell>
              </TableRow>
            ) : (
              filteredProducts.map((product) => {
                const diff = product.newPrice - product.price
                return (
                  <TableRow key={product.id} className={product.changed ? 'bg-yellow-50' : ''}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline">{product.category?.name}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {product.price.toLocaleString()}円
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        value={product.newPrice}
                        onChange={(e) => updatePrice(product.id, Number(e.target.value))}
                        className="w-28 text-right ml-auto"
                        min={0}
                      />
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell">
                      {product.changed && (
                        <Badge variant={diff < 0 ? 'destructive' : 'default'}>
                          {diff > 0 ? '+' : ''}{diff.toLocaleString()}円
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
