'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import React from 'react'
import { AdminHeader } from '@/components/admin/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Download, RefreshCw, Save, ImageIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Product, Category, Subcategory } from '@/types/database'

const SETTING_KEY = 'sns_onepiece_box_default_products'
const BOX_SUBCATEGORY_ID = '09daefe5-d36f-4ccd-931b-e42f3191ff4a'
const PROMO_SUBCATEGORY_ID = '8f5717b7-0a69-4ca4-b012-85608793695f'
const COLS = 8

type Trend = 'up' | 'down' | 'flat'

type ProductWithRelations = Product & {
  category: Category | null
  subcategory: Subcategory | null
}

type ProductWithTrend = ProductWithRelations & {
  trend: Trend
}

export default function MarketingImagePage() {
  const [products, setProducts] = useState<ProductWithTrend[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [saving, setSaving] = useState(false)
  const previewRef1 = useRef<HTMLDivElement>(null)
  const previewRef2 = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // Noto Sans JPをページに動的に読み込む
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700;800;900&display=block'
    document.head.appendChild(link)
    return () => { document.head.removeChild(link) }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [productsResult, cartonResult, settingResult, historyResult] = await Promise.all([
      supabase
        .from('products')
        .select('*, category:categories(*), subcategory:subcategories(*)')
        .eq('is_active', true)
        .eq('category_id', '3fbd50ad-f5b6-4541-b08b-f87d107dae9c')
        .in('subcategory_id', [BOX_SUBCATEGORY_ID, PROMO_SUBCATEGORY_ID])
        .order('sort_order'),
      supabase
        .from('products')
        .select('name, price')
        .eq('is_active', true)
        .eq('category_id', '3fbd50ad-f5b6-4541-b08b-f87d107dae9c')
        .eq('subcategory_id', '424d3a2b-daad-4246-8263-a1cbaa4a0d8c'),
      supabase.from('app_settings').select('value').eq('key', SETTING_KEY).maybeSingle(),
      supabase
        .from('product_price_history')
        .select('product_id, old_price, new_price, changed_at')
        .order('changed_at', { ascending: false }),
    ])

    if (productsResult.error) {
      toast.error('商品の取得に失敗しました')
      setLoading(false)
      return
    }

    const prevPriceMap = new Map<string, number>()
    if (historyResult.data) {
      for (const h of historyResult.data) {
        if (!prevPriceMap.has(h.product_id)) {
          prevPriceMap.set(h.product_id, h.old_price)
        }
      }
    }

    // Build carton price map: strip "カートン"/"ボックス" to match
    const cartonPriceMap = new Map<string, number>()
    if (cartonResult.data) {
      for (const c of cartonResult.data) {
        const baseName = c.name.replace(/\s*(カートン|ボックス)\s*$/i, '').trim()
        if (c.price > 0) cartonPriceMap.set(baseName, c.price)
      }
    }

    const fetched = (productsResult.data || []) as ProductWithRelations[]
    // BOX → プロモの順に並べる（各グループ内はsort_order順を維持）
    const ordered = [
      ...fetched.filter((p) => p.subcategory_id === BOX_SUBCATEGORY_ID),
      ...fetched.filter((p) => p.subcategory_id === PROMO_SUBCATEGORY_ID),
    ]
    const prods = ordered.map((p): ProductWithTrend => {
      const prevPrice = prevPriceMap.get(p.id)
      let trend: Trend = 'flat'
      if (prevPrice != null) {
        if (p.price > prevPrice) trend = 'up'
        else if (p.price < prevPrice) trend = 'down'
      }
      // カートン価格の併記はBOXのみ（プロモには適用しない）
      const baseName = p.name.replace(/\s*(カートン|ボックス)\s*$/i, '').trim()
      const cartonPrice = p.subcategory_id === BOX_SUBCATEGORY_ID ? (cartonPriceMap.get(baseName) ?? null) : null
      return { ...p, price_no_shrink: cartonPrice, trend }
    })

    setProducts(prods)

    if (settingResult.data?.value) {
      try {
        const savedIds: string[] = JSON.parse(settingResult.data.value)
        setSelectedIds(new Set(savedIds.filter((id) => prods.some((p) => p.id === id))))
      } catch {
        setSelectedIds(new Set(prods.map((p) => p.id)))
      }
    } else {
      setSelectedIds(new Set(prods.map((p) => p.id)))
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  function toggleProduct(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function saveDefaults() {
    setSaving(true)
    const value = JSON.stringify(Array.from(selectedIds))
    const tenantId = 'aaaaaaaa-0000-0000-0000-000000000001'
    const { data: existing } = await supabase.from('app_settings').select('key').eq('key', SETTING_KEY).maybeSingle()
    let error
    if (existing) {
      ({ error } = await supabase.from('app_settings').update({ value }).eq('key', SETTING_KEY))
    } else {
      ({ error } = await supabase.from('app_settings').insert({ key: SETTING_KEY, value, description: 'SNS投稿文のデフォルト掲載商品IDリスト', tenant_id: tenantId }))
    }
    setSaving(false)
    if (error) toast.error('保存に失敗しました')
    else toast.success('デフォルト選択を保存しました')
  }

  async function downloadRef(ref: React.RefObject<HTMLDivElement | null>, filename: string) {
    if (!ref.current) return
    const { toPng } = await import('html-to-image')
    const options = { quality: 1, pixelRatio: 2 }
    await toPng(ref.current, options)
    const dataUrl = await toPng(ref.current, options)
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = filename
    a.click()
  }

  async function handleDownload() {
    setDownloading(true)
    try {
      await document.fonts.load('700 16px "Noto Sans JP"')
      await document.fonts.load('800 16px "Noto Sans JP"')
      await document.fonts.load('900 16px "Noto Sans JP"')
      await document.fonts.ready

      const dateStr = new Date().toLocaleDateString('ja-JP').replace(/\//g, '')
      if (totalPages >= 2) {
        await downloadRef(previewRef1, `ワンピース買取価格表_1_${dateStr}.png`)
        await downloadRef(previewRef2, `ワンピース買取価格表_2_${dateStr}.png`)
        toast.success(`${totalPages}枚の画像をダウンロードしました`)
      } else {
        await downloadRef(previewRef1, `ワンピース買取価格表_${dateStr}.png`)
        toast.success('画像をダウンロードしました')
      }
    } catch (e) {
      console.error(e)
      toast.error('画像の生成に失敗しました')
    } finally {
      setDownloading(false)
    }
  }

  const selectedProducts = products.filter((p) => selectedIds.has(p.id))
  const noImageCount = selectedProducts.filter((p) => !p.image_url).length

  // 1枚目: BOX、2枚目: プロモ（BOXが32件を超えた分は2枚目の先頭へ）
  const perPage = 32
  const boxProducts = selectedProducts.filter((p) => p.subcategory_id === BOX_SUBCATEGORY_ID)
  const promoProducts = selectedProducts.filter((p) => p.subcategory_id === PROMO_SUBCATEGORY_ID)
  const page1Products = boxProducts.slice(0, perPage)
  const page2Products = [...boxProducts.slice(perPage), ...promoProducts].slice(0, perPage)
  const totalPages = page2Products.length > 0 ? 2 : 1

  return (
    <div>
      <AdminHeader
        title="ワンピースBOX価格画像生成"
        description="X投稿用のワンピースBOX買取価格画像を自動生成します（1920×1080）"
      />

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 左カラム: 商品選択 */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">掲載する商品</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {selectedIds.size} 件選択中
                  </span>
                  <Button variant="outline" size="sm" onClick={saveDefaults} disabled={saving} className="gap-1">
                    <Save className="h-3.5 w-3.5" />
                    デフォルト保存
                  </Button>
                  <Button variant="ghost" size="icon" onClick={fetchData}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {noImageCount > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠ 画像未設定の商品が {noImageCount} 件あります
                </p>
              )}
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">読み込み中...</p>
              ) : (
                <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1">
                  {products.map((product, index) => (
                    <React.Fragment key={product.id}>
                    {(index === 0 || products[index - 1].subcategory_id !== product.subcategory_id) && (
                      <p className="text-xs font-semibold text-muted-foreground pt-2 first:pt-0">
                        {product.subcategory?.name ?? 'その他'}
                      </p>
                    )}
                    <label
                      className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted transition-colors"
                    >
                      <Checkbox
                        checked={selectedIds.has(product.id)}
                        onCheckedChange={() => toggleProduct(product.id)}
                      />
                      {product.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.image_url} alt="" className="w-8 h-8 object-cover rounded shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded border bg-muted flex items-center justify-center shrink-0">
                          <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                        </div>
                      )}
                      <span className="flex-1 text-sm truncate">{product.name}</span>
                      {product.trend !== 'flat' && (
                        <span className={`text-xs ${product.trend === 'up' ? 'text-green-600' : 'text-red-500'}`}>
                          {product.trend === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                      <Badge variant="secondary" className="shrink-0 tabular-nums text-xs">
                        {product.price.toLocaleString('ja-JP')}円
                      </Badge>
                    </label>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 右カラム: プレビュー */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              プレビュー（1920×1080 / X推奨 16:9）{totalPages > 1 && ` — ${totalPages}枚に分割`}
            </p>
            <Button onClick={handleDownload} disabled={downloading || selectedIds.size === 0} className="gap-2">
              <Download className="h-4 w-4" />
              {downloading ? '生成中...' : totalPages > 1 ? `${totalPages}枚ダウンロード` : 'PNG ダウンロード'}
            </Button>
          </div>

          {totalPages > 1 && <p className="text-xs text-muted-foreground">1枚目</p>}
          <div className="border rounded-lg bg-muted/30" style={{ width: Math.ceil(1920 * 0.35), height: Math.ceil(1080 * 0.35), overflow: 'hidden', position: 'relative' }}>
            <div style={{ transform: 'scale(0.35)', transformOrigin: 'top left', width: '1920px', height: '1080px', position: 'absolute', top: 0, left: 0 }}>
              <PriceImageCanvas
                ref={previewRef1}
                products={page1Products}
              />
            </div>
          </div>

          {page2Products.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground">2枚目</p>
              <div className="border rounded-lg bg-muted/30" style={{ width: Math.ceil(1920 * 0.35), height: Math.ceil(1080 * 0.35), overflow: 'hidden', position: 'relative' }}>
                <div style={{ transform: 'scale(0.35)', transformOrigin: 'top left', width: '1920px', height: '1080px', position: 'absolute', top: 0, left: 0 }}>
                  <PriceImageCanvas
                    ref={previewRef2}
                    products={page2Products}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const PriceImageCanvas = React.forwardRef<HTMLDivElement, {
  products: ProductWithTrend[]
}>(({ products }, ref) => {
  const today = new Date()
  const fmt = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  const updatedAt = fmt(today)

  const W = 1920
  const H = 1080
  const padX = 4
  const gap = 1

  const gridTop = 350
  const footerH = 20
  const gridH = H - gridTop - footerH
  const gridW = W - padX * 2

  const cols = COLS
  const rows = 4

  const cellW = Math.floor((gridW - gap * (cols - 1)) / cols)
  const cellH = Math.floor((gridH - gap * (rows - 1)) / rows)

  const priceH = 32
  const imgH = cellH - priceH
  const nameFontSize = Math.max(Math.min(Math.floor(cellH * 0.08), 12), 8)
  const priceFontSize = Math.max(Math.min(Math.floor(priceH * 0.85), 26), 16)

  return (
    <div
      ref={ref}
      style={{
        width: W, height: H,
        position: 'relative', overflow: 'hidden',
        fontFamily: '"Noto Sans JP", sans-serif',
        boxSizing: 'border-box',
      }}
    >
      {/* Background image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/onepiece-box-bg.png"
        alt=""
        style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, objectFit: 'cover', zIndex: 0 }}
        crossOrigin="anonymous"
      />

      {/* Title overlay（背景画像のタイトルを上書き） */}
      <div style={{
        position: 'absolute', top: 30, left: 545, width: 880, height: 68,
        background: '#111', borderRadius: 34,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1,
      }}>
        <span style={{ color: '#fff', fontSize: 36, fontWeight: 900, letterSpacing: '0.02em', lineHeight: 1 }}>
          ワンピースカードBOX/プロモ 買取価格表
        </span>
      </div>

      {/* Product cards */}
      {products.map((product, index) => {
        const col = index % cols
        const row = Math.floor(index / cols)
        const x = padX + col * (cellW + gap)
        const y = gridTop + row * (cellH + gap)
        return (
          <div key={product.id} style={{
            position: 'absolute', left: x, top: y, width: cellW, height: cellH,
            background: '#fff', border: '1.5px solid #111', borderRadius: 3,
            overflow: 'hidden', boxShadow: '1px 1px 0 #111', zIndex: 2,
            boxSizing: 'border-box',
          }}>
            <div style={{ position: 'relative', width: '100%', height: imgH }}>
              {product.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.image_url} alt={product.name} crossOrigin="anonymous"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', background: 'rgba(0,0,0,0.04)' }} />
              )}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'rgba(0,0,0,0.6)', padding: '2px 3px',
                fontSize: nameFontSize, fontWeight: 900, color: '#fff', textAlign: 'center',
                lineHeight: 1.2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
              }}>
                {product.name}
              </div>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#111', height: priceH, borderRadius: '0 0 2px 2px',
            }}>
              {product.price_no_shrink != null ? (
                <span style={{ color: '#FCD34D', fontSize: Math.floor(priceFontSize * 0.82), fontWeight: 900, lineHeight: 1 }}>
                  ¥{product.price.toLocaleString('ja-JP')}<span style={{ color: '#777', margin: '0 2px' }}>/</span><span style={{ color: '#999' }}>¥{product.price_no_shrink.toLocaleString('ja-JP')}<span style={{ fontSize: Math.floor(priceFontSize * 0.45), marginLeft: 1 }}>カートン</span></span>
                </span>
              ) : (
                <span style={{ color: '#FCD34D', fontSize: priceFontSize, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.01em' }}>
                  ¥{product.price.toLocaleString('ja-JP')}
                </span>
              )}
            </div>
          </div>
        )
      })}

      {/* Footer */}
      <footer style={{
        position: 'absolute', bottom: 4, left: padX, right: padX, height: footerH,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 12, color: '#fff', fontWeight: 600, zIndex: 2,
      }}>
        <span>※ 買取価格は状態・在庫状況により変動する場合がございます。</span>
        <span style={{ fontWeight: 900 }}>更新日：{updatedAt}</span>
      </footer>
    </div>
  )
})
PriceImageCanvas.displayName = 'PriceImageCanvas'
