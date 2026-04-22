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
    const [productsResult, settingResult, historyResult] = await Promise.all([
      supabase
        .from('products')
        .select('*, category:categories(*), subcategory:subcategories(*)')
        .eq('is_active', true)
        .eq('category_id', 'db02ec12-d529-453c-a749-53da99e05533')
        .eq('subcategory_id', '7fc8c032-c373-438a-bc14-6a9e8c113767')
        .order('sort_order'),
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

    const prods = ((productsResult.data || []) as ProductWithRelations[]).map((p): ProductWithTrend => {
      const prevPrice = prevPriceMap.get(p.id)
      let trend: Trend = 'flat'
      if (prevPrice != null) {
        if (p.price > prevPrice) trend = 'up'
        else if (p.price < prevPrice) trend = 'down'
      }
      return { ...p, trend }
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

  // Calculate grid: always 8 columns, rows based on product count + info area
  const rows = Math.ceil((products.length + COLS) / COLS) // +COLS for info area (1 row worth)
  const totalCells = rows * COLS
  const infoSpan = Math.max(totalCells - products.length, 4)

  return (
    <div
      ref={ref}
      style={{
        width: 1920,
        height: 1080,
        background: '#FCD34D',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: '"Noto Sans JP", sans-serif',
        padding: '24px 36px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Palm leaf decorations */}
      <div style={{ position: 'absolute', top: -30, right: -30, opacity: 0.12, pointerEvents: 'none' }}>
        <PalmLeaf size={220} color="#1a1a1a" rotate={25} />
      </div>
      <div style={{ position: 'absolute', bottom: -40, left: -40, opacity: 0.1, pointerEvents: 'none' }}>
        <PalmLeaf size={200} color="#1a1a1a" rotate={-150} />
      </div>

      {/* Header - compact */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, position: 'relative', zIndex: 2, gap: 16,
      }}>
        {/* Logo */}
        <div style={{ flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/logo-full.png"
            alt="買取スクエア"
            style={{ height: 160, width: 160, objectFit: 'contain', display: 'block' }}
            crossOrigin="anonymous"
          />
        </div>

        {/* Main title area */}
        <div style={{ position: 'relative', flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {/* Sunburst SVG */}
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

          {/* Title */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, transform: 'rotate(-2.5deg)' }}>
            <div style={{ color: '#dc2626', fontSize: 40, fontWeight: 900, WebkitTextStroke: '3px #111', paintOrder: 'stroke fill', filter: 'drop-shadow(3px 3px 0 #111)' }}>★</div>
            <h1 style={{
              margin: 0, fontFamily: '"Noto Sans JP", sans-serif',
              fontSize: 110, fontWeight: 900, lineHeight: 0.92, letterSpacing: '0.04em',
              color: '#fff', WebkitTextStroke: '10px #111', paintOrder: 'stroke fill',
              textShadow: '0 0 0 #111, 7px 7px 0 #dc2626, 11px 11px 0 #111',
              position: 'relative', whiteSpace: 'nowrap',
            }}>高価買取</h1>
            <div style={{ color: '#dc2626', fontSize: 40, fontWeight: 900, WebkitTextStroke: '3px #111', paintOrder: 'stroke fill', filter: 'drop-shadow(3px 3px 0 #111)' }}>★</div>

            {/* Top label */}
            <div style={{
              position: 'absolute', top: -36, left: '50%', transform: 'translateX(-50%)',
              background: '#dc2626', color: '#fff', padding: '4px 18px',
              fontSize: 16, fontWeight: 900, letterSpacing: '0.2em',
              fontFamily: '"Noto Sans JP", sans-serif', borderRadius: 2,
              whiteSpace: 'nowrap', border: '2px solid #111', boxShadow: '2px 2px 0 #111',
            }}>
              ポケモンカードBOX 買取価格表
            </div>
          </div>
        </div>

        {/* Right: 3 badges */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, minWidth: 220 }}>
          <div style={{ background: '#fff', border: '2px solid #111', padding: '6px 14px', borderRadius: 8, transform: 'rotate(3deg)', boxShadow: '4px 4px 0 #111', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#dc2626', lineHeight: 1, letterSpacing: '0.05em' }}>★ 全種 ★</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#111', lineHeight: 1.05, marginTop: 2 }}>シュリンクあり！</div>
          </div>
          <div style={{ background: '#111', color: '#FCD34D', padding: '6px 14px', borderRadius: 8, transform: 'rotate(-2.5deg)', boxShadow: '4px 4px 0 #dc2626', border: '2px solid #111', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: '#fff', letterSpacing: '0.2em', opacity: 0.85 }}>FAST PAYMENT</div>
            <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.05, marginTop: 1, letterSpacing: '0.02em' }}>到着日振込！</div>
          </div>
          <div style={{ background: '#dc2626', color: '#fff', padding: '6px 14px', borderRadius: 8, transform: 'rotate(2.5deg)', boxShadow: '4px 4px 0 #111', border: '2px solid #111', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: '#FCD34D', letterSpacing: '0.2em' }}>FREE SHIPPING</div>
            <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.05, marginTop: 1, letterSpacing: '0.02em' }}>
              着払<span style={{ fontSize: 26, color: '#FCD34D' }}>10</span>箱から可能！
            </div>
          </div>
        </div>
      </header>

      {/* Red gradient line */}
      <div style={{ height: 3, background: 'linear-gradient(90deg, #dc2626 0%, #f59e0b 50%, #dc2626 100%)', marginBottom: 8, position: 'relative', zIndex: 2 }} />

      {/* Product grid */}
      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: `repeat(${COLS}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: 6, position: 'relative', zIndex: 2,
        minHeight: 0,
      }}>
        {products.map((product) => (
          <div key={product.id} style={{
            background: '#fff', border: '2px solid #111', borderRadius: 4,
            padding: '4px 4px 6px', display: 'flex', flexDirection: 'column',
            overflow: 'hidden', boxShadow: '2px 2px 0 #111', minHeight: 0,
          }}>
            {/* Image area - fills available space */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
              {product.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.image_url}
                  alt={product.name}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  crossOrigin="anonymous"
                />
              ) : (
                <div style={{
                  width: '100%', height: '100%',
                  background: 'rgba(0,0,0,0.04)', border: '1px dashed rgba(0,0,0,0.18)',
                  borderRadius: 4,
                }} />
              )}
            </div>
            {/* Product name */}
            <div style={{
              fontSize: 12, fontWeight: 800, color: '#111', textAlign: 'center',
              lineHeight: 1.15, marginTop: 2, flexShrink: 0,
              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
            }}>
              {product.name}
            </div>
            {/* Price tag */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 3, marginTop: 2, background: '#111', padding: '4px 3px', borderRadius: 3, flexShrink: 0,
            }}>
              {product.trend !== 'flat' && (
                <span style={{ color: product.trend === 'up' ? '#4ade80' : '#fca5a5', fontSize: 10, fontWeight: 900 }}>
                  {product.trend === 'up' ? '▲' : '▼'}
                </span>
              )}
              <span style={{ color: '#FCD34D', fontSize: 18, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.01em' }}>
                ¥{product.price.toLocaleString('ja-JP')}
              </span>
            </div>
          </div>
        ))}

        {/* Information area */}
        {products.length > 0 && (
          <div style={{
            gridColumn: `span ${infoSpan}`, background: '#111', color: '#FCD34D',
            borderRadius: 6, padding: '8px 14px', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between', border: '2px solid #111',
          }}>
            <div>
              <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, letterSpacing: '0.1em' }}>VALID UNTIL</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginTop: 1 }}>{validUntil} まで有効</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, letterSpacing: '0.1em' }}>UPDATED</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginTop: 1 }}>{updatedAt}</div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{
        marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 13, color: '#111', fontWeight: 600, position: 'relative', zIndex: 2,
      }}>
        <span>※ 買取価格は状態・在庫状況により変動する場合がございます。</span>
        <span style={{ fontWeight: 900 }}>kaitorisquare.net</span>
      </footer>
    </div>
  )
})
PriceImageCanvas.displayName = 'PriceImageCanvas'
