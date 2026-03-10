'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

interface PricesContentProps {
  initialCategories: Category[]
  initialSubcategories: Subcategory[]
  initialProducts: ProductItem[]
  initialCategoryId?: string
}

export function PricesContent({ initialCategories, initialSubcategories, initialProducts, initialCategoryId }: PricesContentProps) {
  const categories = initialCategories
  const subcategories = initialSubcategories
  const products = initialProducts
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    if (initialCategoryId && categories.some((c) => c.id === initialCategoryId)) {
      return initialCategoryId
    }
    return categories.length > 0 ? categories[0].id : 'all'
  })
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all')
  const [search, setSearch] = useState('')

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

  function handleCategoryChange(categoryId: string) {
    setSelectedCategory(categoryId)
    setSelectedSubcategory('all')
  }

  return (
    <div className="min-h-screen bg-muted/50">
      <Header hideApplyButton />

      <section className="bg-gradient-to-b from-orange-50 to-muted/50 py-8 sm:py-12">
        <div className="max-w-4xl mx-auto text-center px-4">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">買取価格一覧</h2>
          <p className="text-muted-foreground">
            最新の買取価格です。価格は市場状況により変動することがあります。
          </p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Category Tabs */}
        <div className="relative">
          <div
            className="overflow-x-auto -mx-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="カテゴリ選択"
          >
            <div className="flex gap-1 min-w-max py-1">
              <button
                role="tab"
                aria-selected={selectedCategory === 'all'}
                onClick={() => handleCategoryChange('all')}
                className={`px-4 py-2 text-sm font-medium rounded-full whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  selectedCategory === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                }`}
              >
                全カテゴリ
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  role="tab"
                  aria-selected={selectedCategory === c.id}
                  onClick={() => handleCategoryChange(c.id)}
                  className={`px-4 py-2 text-sm font-medium rounded-full whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                    selectedCategory === c.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          {/* スクロールヒント（右端フェード） */}
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-muted/50 to-transparent" />
        </div>

        {/* Search + Subcategory Filter */}
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

        {productsByCategory.length === 0 ? (
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
                      <div className="divide-y">
                        {group.products.map((product) => (
                          <div key={product.id} className="flex items-center justify-between gap-4 py-2.5 px-1">
                            <span className="font-medium text-sm min-w-0 break-words">{product.name}</span>
                            <span className="font-bold text-primary whitespace-nowrap text-sm shrink-0">
                              {product.price.toLocaleString()}円
                            </span>
                          </div>
                        ))}
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
    </div>
  )
}
