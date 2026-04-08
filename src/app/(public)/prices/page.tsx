'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search } from 'lucide-react'
import { Footer } from '@/components/public/footer'
import { Header } from '@/components/public/header'
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
      const res = await fetch('/api/public/prices')
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      setCategories(data.categories ?? [])
      setSubcategories(data.subcategories ?? [])
      setProducts((data.products ?? []) as ProductItem[])
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
    <div className="min-h-screen bg-background pb-16 sm:pb-0">
      <Header hideApplyButton />

      {/* Page hero */}
      <section className="relative py-10 sm:py-14 overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern" />
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-[#FF6B00]/8 rounded-full blur-[80px]" />
        <div className="relative max-w-4xl mx-auto text-center px-4">
          <p className="text-xs font-semibold tracking-[0.2em] text-[#FF6B00] uppercase mb-2">Price List</p>
          <h1 className="font-heading text-2xl sm:text-3xl text-foreground mb-2">買取価格一覧</h1>
          <p className="text-muted-foreground text-sm">
            最新の買取価格です。価格は市場状況により変動することがあります。
          </p>
        </div>
      </section>

      {/* Sticky search & filters */}
      <div className="sticky top-[52px] z-30 bg-background/90 backdrop-blur-xl border-b border-border py-3">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="商品名で検索..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-white/[0.05] border-white/[0.08] text-[16px]"
              />
            </div>
            <Select value={selectedCategory} onValueChange={(v) => { setSelectedCategory(v); setSelectedSubcategory('all') }}>
              <SelectTrigger className="w-full sm:w-48 bg-white/[0.05] border-white/[0.08]">
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
                <SelectTrigger className="w-full sm:w-52 bg-white/[0.05] border-white/[0.08]">
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
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {loading ? (
          <p className="text-center py-8 text-muted-foreground">読み込み中...</p>
        ) : productsByCategory.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">該当する商品がありません</p>
        ) : (
          productsByCategory.map((cat) => (
            <div key={cat.id} className="rounded-xl border border-border overflow-hidden bg-card">
              <div className="border-t-[3px] border-[#FF6B00] px-5 py-4 bg-white/[0.02]">
                <h2 className="font-bold text-foreground">{cat.name}</h2>
              </div>
              <div className="px-5 pb-4">
                <div className="space-y-5">
                  {cat.groups.map((group) => (
                    <div key={group.name || '_ungrouped'}>
                      {group.name && (
                        <h3 className="font-medium text-xs text-muted-foreground mb-2 mt-3 uppercase tracking-wider">{group.name}</h3>
                      )}
                      <div className="divide-y divide-border">
                        {group.products.map((product) => (
                          <div key={product.id} className="flex items-center justify-between gap-4 py-3 px-1">
                            <span className="font-medium text-sm min-w-0 break-words text-foreground">{product.name}</span>
                            <span className="font-heading text-lg text-[#FF6B00] whitespace-nowrap shrink-0">
                              {product.price.toLocaleString()}<span className="text-xs font-sans text-muted-foreground ml-0.5">円</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Footer />
    </div>
  )
}
