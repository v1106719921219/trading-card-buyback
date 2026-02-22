'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Search } from 'lucide-react'
import { Footer } from '@/components/public/footer'
import { Header } from '@/components/public/header'
import { createClient } from '@/lib/supabase/client'
import type { Category, Subcategory } from '@/types/database'

interface ProductItem {
  id: string
  name: string
  price: number
  sort_order: number
  category_id: string
  subcategory_id: string | null
  category: Category
  subcategory: Subcategory | null
}

export default function PricesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [products, setProducts] = useState<ProductItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const [catResult, subResult, prodResult] = await Promise.all([
        supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('subcategories').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('products').select('*, category:categories(*), subcategory:subcategories(*)').eq('is_active', true).eq('show_in_price_list', true).gt('price', 0).order('sort_order').order('name'),
      ])
      if (catResult.data) setCategories(catResult.data)
      if (subResult.data) setSubcategories(subResult.data)
      if (prodResult.data) setProducts(prodResult.data as ProductItem[])
      setLoading(false)
    }
    fetchData()
  }, [])

  const filteredSubcategories = subcategories.filter((s) =>
    selectedCategory !== 'all' ? s.category_id === selectedCategory : true
  )

  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'all' || p.category_id === selectedCategory
    const matchesSubcategory = selectedSubcategory === 'all' || p.subcategory_id === selectedSubcategory
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
    return matchesCategory && matchesSubcategory && matchesSearch
  })

  // Group filtered products by category then subcategory
  const displayCategories = (selectedCategory === 'all' ? categories : categories.filter((c) => c.id === selectedCategory))
  const productsByCategory = displayCategories.map((cat) => {
    const catProducts = filteredProducts
      .filter((p) => p.category_id === cat.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const catSubcategories = subcategories.filter((s) => s.category_id === cat.id)

    if (catSubcategories.length === 0) {
      return { ...cat, groups: [{ name: null, products: catProducts }] }
    }

    const groups = catSubcategories
      .filter((sub) => selectedSubcategory === 'all' || sub.id === selectedSubcategory)
      .map((sub) => ({
        name: sub.name,
        products: catProducts.filter((p) => p.subcategory_id === sub.id),
      }))
    const ungrouped = catProducts.filter((p) => !p.subcategory_id)
    if (ungrouped.length > 0 && selectedSubcategory === 'all') {
      groups.push({ name: 'その他', products: ungrouped })
    }

    return { ...cat, groups: groups.filter((g) => g.products.length > 0) }
  }).filter((cat) => cat.groups.length > 0)

  return (
    <div className="min-h-screen bg-muted/50">
      <Header />

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">買取価格一覧</h2>
          <p className="text-muted-foreground">
            最新の買取価格です。価格は市場状況により変動することがあります。
          </p>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="商品名で検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={selectedCategory} onValueChange={(v) => { setSelectedCategory(v); setSelectedSubcategory('all') }}>
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
            <Select value={selectedSubcategory} onValueChange={setSelectedSubcategory}>
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

        {loading ? (
          <p className="text-center py-8 text-muted-foreground">読み込み中...</p>
        ) : productsByCategory.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">該当する商品がありません</p>
        ) : (
          productsByCategory.map((cat) => (
            <Card key={cat.id}>
              <CardHeader>
                <CardTitle>{cat.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {cat.groups.map((group) => (
                    <div key={group.name || '_ungrouped'}>
                      {group.name && (
                        <h3 className="font-medium text-sm text-muted-foreground mb-2">{group.name}</h3>
                      )}
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>商品名</TableHead>
                              <TableHead className="text-right">買取価格</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.products.map((product) => (
                              <TableRow key={product.id}>
                                <TableCell className="font-medium">{product.name}</TableCell>
                                <TableCell className="text-right font-bold text-primary">
                                  {product.price.toLocaleString()}円
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Footer />

      {/* Fixed bottom banner */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-50">
        <div className="max-w-4xl mx-auto px-4 py-2 sm:py-3 text-center">
          <Link href="/apply">
            <Button size="lg" className="w-full sm:w-auto">買取を申し込む</Button>
          </Link>
        </div>
      </div>
      <div className="h-20" />
    </div>
  )
}
