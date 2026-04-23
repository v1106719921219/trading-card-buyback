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

const SETTING_KEY = 'sns_post_default_products'
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
  const previewRef = useRef<HTMLDivElement>(null)
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
    const [productsResult, noShrinkResult, settingResult, historyResult] = await Promise.all([
      supabase
        .from('products')
        .select('*, category:categories(*), subcategory:subcategories(*)')
        .eq('is_active', true)
        .eq('category_id', 'db02ec12-d529-453c-a749-53da99e05533')
        .eq('subcategory_id', '7fc8c032-c373-438a-bc14-6a9e8c113767')
        .order('sort_order'),
      supabase
        .from('products')
        .select('name, price')
        .eq('is_active', true)
        .eq('category_id', 'db02ec12-d529-453c-a749-53da99e05533')
        .eq('subcategory_id', '9c1bdee7-e844-4be7-a298-de73d8af5670'),
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

    // Build no-shrink price map: match by name (strip "シュリンク無し" suffix)
    const noShrinkPriceMap = new Map<string, number>()
    if (noShrinkResult.data) {
      for (const ns of noShrinkResult.data) {
        const baseName = ns.name.replace(/\s*シュリンク無し\s*$/, '').trim()
        noShrinkPriceMap.set(baseName, ns.price)
      }
    }

    const prods = ((productsResult.data || []) as ProductWithRelations[]).map((p): ProductWithTrend => {
      const prevPrice = prevPriceMap.get(p.id)
      let trend: Trend = 'flat'
      if (prevPrice != null) {
        if (p.price > prevPrice) trend = 'up'
        else if (p.price < prevPrice) trend = 'down'
      }
      const noShrinkPrice = noShrinkPriceMap.get(p.name) ?? null
      return { ...p, price_no_shrink: noShrinkPrice, trend }
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
    const ids = Array.from(selectedIds)
    const { error } = await supabase
      .from('app_settings')
      .upsert(
        { key: SETTING_KEY, value: JSON.stringify(ids), description: 'SNS投稿文のデフォルト掲載商品IDリスト' },
        { onConflict: 'key' }
      )
    setSaving(false)
    if (error) toast.error('保存に失敗しました')
    else toast.success('デフォルト選択を保存しました')
  }

  async function handleDownload() {
    if (!previewRef.current) return
    setDownloading(true)
    try {
      await document.fonts.load('700 16px "Noto Sans JP"')
      await document.fonts.load('800 16px "Noto Sans JP"')
      await document.fonts.load('900 16px "Noto Sans JP"')
      await document.fonts.ready

      const { toPng } = await import('html-to-image')
      const options = { quality: 1, pixelRatio: 2 }

      await toPng(previewRef.current, options)
      const dataUrl = await toPng(previewRef.current, options)

      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `買取価格表_${new Date().toLocaleDateString('ja-JP').replace(/\//g, '')}.png`
      a.click()
      toast.success('画像をダウンロードしました')
    } catch (e) {
      console.error(e)
      toast.error('画像の生成に失敗しました')
    } finally {
      setDownloading(false)
    }
  }

  const selectedProducts = products.filter((p) => selectedIds.has(p.id))
  const noImageCount = selectedProducts.filter((p) => !p.image_url).length

  return (
    <div>
      <AdminHeader
        title="SNS価格画像生成"
        description="X投稿用の買取価格画像を自動生成します（1920×1080）"
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
                  {products.map((product) => (
                    <label
                      key={product.id}
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
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 右カラム: プレビュー */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">プレビュー（1920×1080 / X推奨 16:9）</p>
            <Button onClick={handleDownload} disabled={downloading || selectedIds.size === 0} className="gap-2">
              <Download className="h-4 w-4" />
              {downloading ? '生成中...' : 'PNG ダウンロード'}
            </Button>
          </div>

          <div className="overflow-auto border rounded-lg bg-muted/30">
            <div style={{ transform: 'scale(0.35)', transformOrigin: 'top left', width: '1920px', height: '1080px' }}>
              <PriceImageCanvas
                ref={previewRef}
                products={selectedProducts}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- PalmLeaf SVG decoration ---
function PalmLeaf({ size, color, rotate }: { size: number; color: string; rotate: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ transform: `rotate(${rotate}deg)` }}>
      <g fill={color}>
        <path d="M50 95 Q48 60 35 40 Q30 50 32 65 Q35 80 48 92 Z" />
        <path d="M50 95 Q52 60 65 40 Q70 50 68 65 Q65 80 52 92 Z" />
        <path d="M48 80 Q25 70 10 50 Q20 50 35 60 Q45 68 48 78 Z" />
        <path d="M52 80 Q75 70 90 50 Q80 50 65 60 Q55 68 52 78 Z" />
        <path d="M46 60 Q20 55 8 30 Q22 35 38 48 Q45 55 46 58 Z" />
        <path d="M54 60 Q80 55 92 30 Q78 35 62 48 Q55 55 54 58 Z" />
        <path d="M48 40 Q30 30 25 10 Q38 18 48 35 Z" />
        <path d="M52 40 Q70 30 75 10 Q62 18 52 35 Z" />
      </g>
    </svg>
  )
}

// --- Main SNS Price Image Canvas (1920 × 1080) ---
const PriceImageCanvas = React.forwardRef<HTMLDivElement, {
  products: ProductWithTrend[]
}>(({ products }, ref) => {
  const today = new Date()
  const validUntilDate = new Date(today)
  validUntilDate.setDate(validUntilDate.getDate() + 7)

  const fmt = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`

  const updatedAt = fmt(today)
  const validUntil = fmt(validUntilDate)

  // --- Explicit pixel layout (no flex dependency) ---
  const W = 1920
  const H = 1080
  const padX = 36
  const padY = 20
  const headerH = 100
  const footerH = 24
  const lineH = 3
  const gap = 6

  const gridTop = padY + headerH + 8 + lineH + 8
  const gridH = H - gridTop - padY - footerH - 6
  const gridW = W - padX * 2

  // Grid dimensions — no info area, all cells for products
  const cols = COLS
  const rows = Math.ceil(products.length / cols)

  const cellW = Math.floor((gridW - gap * (cols - 1)) / cols)
  const cellH = Math.floor((gridH - gap * (rows - 1)) / rows)

  // Card inner sizes — proportional to cell height
  const nameH = Math.max(Math.min(Math.floor(cellH * 0.16), 26), 14)
  const priceH = Math.max(Math.min(Math.floor(cellH * 0.2), 28), 18)
  const cardPadV = 3
  const imgH = Math.max(cellH - nameH - priceH - cardPadV * 2 - 6, 10) // 6 = margins
  const nameFontSize = Math.max(Math.min(Math.floor(nameH * 0.6), 13), 8)
  const priceFontSize = Math.max(Math.min(Math.floor(priceH * 0.7), 20), 12)

  return (
    <div
      ref={ref}
      style={{
        width: W,
        height: H,
        background: '#FCD34D',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: '"Noto Sans JP", sans-serif',
        boxSizing: 'border-box',
      }}
    >
      {/* Palm leaf decorations */}
      <div style={{ position: 'absolute', top: -30, right: -30, opacity: 0.12, pointerEvents: 'none' }}>
        <PalmLeaf size={220} color="#1a1a1a" rotate={25} />
      </div>
      <div style={{ position: 'absolute', bottom: -40, left: -40, opacity: 0.1, pointerEvents: 'none' }}>
        <PalmLeaf size={200} color="#1a1a1a" rotate={-150} />
      </div>

      {/* Header — absolute, fixed height */}
      <header style={{
        position: 'absolute', top: padY, left: padX, right: padX, height: headerH,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        zIndex: 2, gap: 16,
      }}>
        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/logo-full.png"
          alt="買取スクエア"
          style={{ height: 200, width: 200, objectFit: 'contain', display: 'block', flexShrink: 0, marginTop: -30, marginBottom: -30 }}
          crossOrigin="anonymous"
        />

        {/* Main title area */}
        <div style={{ position: 'relative', flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <svg viewBox="-100 -100 200 200" style={{ position: 'absolute', width: 480, height: 160, opacity: 0.85, pointerEvents: 'none' }}>
            <defs>
              <radialGradient id="burstFade">
                <stop offset="0%" stopColor="#dc2626" stopOpacity="0" />
                <stop offset="40%" stopColor="#dc2626" stopOpacity="0" />
                <stop offset="100%" stopColor="#dc2626" stopOpacity="0.85" />
              </radialGradient>
              <mask id="burstMask">
                <rect x="-100" y="-100" width="200" height="200" fill="white" />
                {Array.from({ length: 24 }).map((_, i) => {
                  const a = (i * 360 / 24) * Math.PI / 180
                  const a2 = ((i + 0.5) * 360 / 24) * Math.PI / 180
                  const x1 = Math.cos(a) * 140, y1 = Math.sin(a) * 140
                  const x2 = Math.cos(a2) * 140, y2 = Math.sin(a2) * 140
                  return <polygon key={i} points={`0,0 ${x1},${y1} ${x2},${y2}`} fill="black" />
                })}
              </mask>
            </defs>
            <circle cx="0" cy="0" r="140" fill="url(#burstFade)" mask="url(#burstMask)" />
          </svg>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, transform: 'rotate(-2deg)' }}>
            <span style={{ color: '#dc2626', fontSize: 36, fontWeight: 900, WebkitTextStroke: '3px #111', paintOrder: 'stroke fill', filter: 'drop-shadow(3px 3px 0 #111)' }}>★</span>
            <h1 style={{
              margin: 0, fontFamily: '"Noto Sans JP", sans-serif',
              fontSize: 88, fontWeight: 900, lineHeight: 1, letterSpacing: '0.04em',
              color: '#fff', WebkitTextStroke: '8px #111', paintOrder: 'stroke fill',
              textShadow: '0 0 0 #111, 6px 6px 0 #dc2626, 10px 10px 0 #111',
              whiteSpace: 'nowrap',
            }}>高価買取</h1>
            <span style={{ color: '#dc2626', fontSize: 36, fontWeight: 900, WebkitTextStroke: '3px #111', paintOrder: 'stroke fill', filter: 'drop-shadow(3px 3px 0 #111)' }}>★</span>

            <div style={{
              position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)',
              background: '#dc2626', color: '#fff', padding: '2px 14px',
              fontSize: 13, fontWeight: 900, letterSpacing: '0.15em',
              borderRadius: 2, whiteSpace: 'nowrap', border: '2px solid #111', boxShadow: '2px 2px 0 #111',
            }}>
              ポケモンカードBOX 買取価格表
            </div>
          </div>
        </div>

        {/* Right: badges — horizontal */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <div style={{ background: '#fff', border: '2px solid #111', padding: '5px 10px', borderRadius: 8, transform: 'rotate(2deg)', boxShadow: '3px 3px 0 #111', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: '#dc2626', lineHeight: 1 }}>★ 全種 ★</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#111', lineHeight: 1.1, marginTop: 1 }}>シュリンクあり！</div>
          </div>
          <div style={{ background: '#111', color: '#FCD34D', padding: '5px 10px', borderRadius: 8, transform: 'rotate(-2deg)', boxShadow: '3px 3px 0 #dc2626', border: '2px solid #111', textAlign: 'center' }}>
            <div style={{ fontSize: 8, fontWeight: 900, color: '#fff', letterSpacing: '0.15em', opacity: 0.85 }}>FAST PAYMENT</div>
            <div style={{ fontSize: 16, fontWeight: 900, lineHeight: 1.1, marginTop: 1 }}>到着日振込！</div>
          </div>
          <div style={{ background: '#dc2626', color: '#fff', padding: '5px 10px', borderRadius: 8, transform: 'rotate(2deg)', boxShadow: '3px 3px 0 #111', border: '2px solid #111', textAlign: 'center' }}>
            <div style={{ fontSize: 8, fontWeight: 900, color: '#FCD34D', letterSpacing: '0.15em' }}>FREE SHIPPING</div>
            <div style={{ fontSize: 14, fontWeight: 900, lineHeight: 1.1, marginTop: 1 }}>
              着払<span style={{ fontSize: 18, color: '#FCD34D' }}>10</span>箱〜
            </div>
          </div>
        </div>
      </header>

      {/* Red gradient line */}
      <div style={{ position: 'absolute', top: padY + headerH + 8, left: padX, right: padX, height: lineH, background: 'linear-gradient(90deg, #dc2626 0%, #f59e0b 50%, #dc2626 100%)', zIndex: 2 }} />

      {/* Product cards — each individually positioned by pixel coordinates */}
      {products.map((product, index) => {
        const col = index % cols
        const row = Math.floor(index / cols)
        const x = padX + col * (cellW + gap)
        const y = gridTop + row * (cellH + gap)
        return (
          <div key={product.id} style={{
            position: 'absolute', left: x, top: y, width: cellW, height: cellH,
            background: '#fff', border: '2px solid #111', borderRadius: 4,
            padding: `${cardPadV}px 4px`,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden', boxShadow: '2px 2px 0 #111', zIndex: 2,
            boxSizing: 'border-box',
          }}>
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image_url}
                alt={product.name}
                style={{ width: '100%', height: imgH, objectFit: 'contain' }}
                crossOrigin="anonymous"
              />
            ) : (
              <div style={{
                width: '100%', height: imgH,
                background: 'rgba(0,0,0,0.04)', border: '1px dashed rgba(0,0,0,0.18)',
                borderRadius: 4,
              }} />
            )}
            <div style={{
              fontSize: nameFontSize, fontWeight: 800, color: '#111', textAlign: 'center',
              lineHeight: 1.15, height: nameH, marginTop: 2,
              overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {product.name}
            </div>
            {product.price_no_shrink != null ? (
              <div style={{
                marginTop: 2, background: '#111', height: priceH, borderRadius: 3,
                display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '1px 3px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                  <span style={{ color: '#fff', fontSize: Math.floor(priceFontSize * 0.5), fontWeight: 700 }}>封</span>
                  <span style={{ color: '#FCD34D', fontSize: Math.floor(priceFontSize * 0.8), fontWeight: 900, lineHeight: 1 }}>
                    ¥{product.price.toLocaleString('ja-JP')}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                  <span style={{ color: '#9ca3af', fontSize: Math.floor(priceFontSize * 0.5), fontWeight: 700 }}>開</span>
                  <span style={{ color: '#9ca3af', fontSize: Math.floor(priceFontSize * 0.7), fontWeight: 900, lineHeight: 1 }}>
                    ¥{product.price_no_shrink.toLocaleString('ja-JP')}
                  </span>
                </div>
              </div>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 3, marginTop: 2, background: '#111', height: priceH, borderRadius: 3,
              }}>
                {product.trend !== 'flat' && (
                  <span style={{ color: product.trend === 'up' ? '#4ade80' : '#fca5a5', fontSize: Math.floor(priceFontSize * 0.55), fontWeight: 900 }}>
                    {product.trend === 'up' ? '▲' : '▼'}
                  </span>
                )}
                <span style={{ color: '#FCD34D', fontSize: priceFontSize, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.01em' }}>
                  ¥{product.price.toLocaleString('ja-JP')}
                </span>
              </div>
            )}
          </div>
        )
      })}

      {/* Footer */}
      <footer style={{
        position: 'absolute', bottom: padY, left: padX, right: padX, height: footerH,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 12, color: '#111', fontWeight: 600, zIndex: 2,
      }}>
        <span>※ 買取価格は状態・在庫状況により変動する場合がございます。</span>
        <span style={{ fontWeight: 900 }}>更新日：{updatedAt}</span>
      </footer>
    </div>
  )
})
PriceImageCanvas.displayName = 'PriceImageCanvas'
