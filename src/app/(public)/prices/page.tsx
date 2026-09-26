'use client'

import { publicSubcategories } from '@/lib/public-subcategories'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, ImageIcon, ZoomIn } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Footer } from '@/components/public/footer'
import { Header } from '@/components/public/header'
import type { Category, Subcategory } from '@/types/database'

interface ProductItem {
  id: string
  name: string
  price: number
  image_url: string | null
  model_number: string | null
  set_number: string | null
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
  const [preview, setPreview] = useState<ProductItem | null>(null)
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())
  const markImageFailed = (id: string) => setFailedImages((previous) => new Set([...previous, id]))

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

  const filteredSubcategories = publicSubcategories(subcategories, categories, products, selectedCategory)

  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'all' || p.category_id === selectedCategory
    const matchesSubcategory = selectedSubcategory === 'all' || filteredSubcategories.find(s => s.id === selectedSubcategory)?.ids.includes(p.subcategory_id || '')
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
    return matchesCategory && matchesSubcategory && matchesSearch
  })

  const displayCategories = (selectedCategory === 'all' ? categories : categories.filter((c) => c.id === selectedCategory))
  const productsByCategory = displayCategories.map((cat) => {
    const catProducts = filteredProducts
      .filter((p) => p.category_id === cat.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const catSubcategories = publicSubcategories(subcategories, categories, products, cat.id)

    if (catSubcategories.length === 0) {
      return { ...cat, groups: [{ name: null, products: catProducts }] }
    }

    const groups = catSubcategories
      .filter((sub) => selectedSubcategory === 'all' || sub.id === selectedSubcategory)
      .map((sub) => ({
        name: sub.name,
        products: catProducts.filter((p) => sub.ids.includes(p.subcategory_id || '')),
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
                <SelectTrigger aria-label="商品タイプ" className="w-full sm:w-72 bg-white/[0.05] border-white/[0.08]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべての商品タイプ</SelectItem>
                  {filteredSubcategories.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
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
                        {group.products.map((product) => {
                          const bracketCode = product.name.match(/\[([^\]]+)\]/)?.[1]
                          const code = bracketCode || [product.set_number, product.model_number]
                            .filter((v, i, values) => v && (i === 0 || !values[0]?.includes(v))).join(' / ')
                          const name = bracketCode ? product.name.replace(/\s*\[[^\]]+\]/, '').trim() : product.name
                          const hasImage = !!product.image_url && !failedImages.has(product.id)
                          return (
                            <div key={product.id} data-price-product={product.id} className="grid grid-cols-[56px_minmax(0,1fr)_auto] sm:grid-cols-[76px_minmax(0,1fr)_auto] items-center gap-2 sm:gap-4 py-3">
                              {hasImage ? (
                                <button type="button" onClick={() => setPreview(product)} aria-label={`${product.name}の写真を拡大`}
                                  className="relative h-[76px] w-14 sm:h-[100px] sm:w-[76px] rounded-md border border-border bg-white p-0.5 hover:border-[#FF6B00] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF6B00]">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={product.image_url!} alt={product.name} loading="lazy" decoding="async"
                                    onError={() => markImageFailed(product.id)} className="h-full w-full object-contain" />
                                  <ZoomIn aria-hidden="true" className="absolute bottom-0.5 right-0.5 size-4 rounded bg-white/90 p-0.5 text-muted-foreground" />
                                </button>
                              ) : (
                                <div className="flex h-[76px] w-14 sm:h-[100px] sm:w-[76px] flex-col items-center justify-center rounded-md bg-muted text-muted-foreground" aria-label="商品画像なし">
                                  <ImageIcon aria-hidden="true" className="size-5" />
                                  <span className="mt-1 text-[10px]">画像なし</span>
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-medium text-[13px] sm:text-sm break-words text-foreground">{name}</p>
                                {code && <p className="mt-1 text-[11px] sm:text-xs break-words text-muted-foreground">{code}</p>}
                              </div>
                              <span className="font-heading text-base sm:text-lg text-[#FF6B00] whitespace-nowrap">
                                {product.price.toLocaleString('ja-JP')}<span className="text-xs font-sans text-muted-foreground ml-0.5">円</span>
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={preview !== null} onOpenChange={(open) => { if (!open) setPreview(null) }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-6 break-words text-left">{preview?.name}</DialogTitle>
            <DialogDescription className="text-left">買取価格：{preview?.price.toLocaleString('ja-JP')}円</DialogDescription>
          </DialogHeader>
          {preview?.image_url && !failedImages.has(preview.id) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.image_url} alt={preview.name} onError={() => markImageFailed(preview.id)}
              className="mx-auto h-auto max-h-[60dvh] w-full rounded-md bg-white object-contain" />
          ) : <p className="py-12 text-center text-muted-foreground">画像を表示できません</p>}
        </DialogContent>
      </Dialog>
      <Footer />
    </div>
  )
}
