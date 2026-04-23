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
    const [productsResult, cartonResult, settingResult, historyResult] = await Promise.all([
      supabase
        .from('products')
        .select('*, category:categories(*), subcategory:subcategories(*)')
        .eq('is_active', true)
        .eq('category_id', '3fbd50ad-f5b6-4541-b08b-f87d107dae9c')
        .eq('subcategory_id', '09daefe5-d36f-4ccd-931b-e42f3191ff4a')
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

    const prods = ((productsResult.data || []) as ProductWithRelations[]).map((p): ProductWithTrend => {
      const prevPrice = prevPriceMap.get(p.id)
      let trend: Trend = 'flat'
      if (prevPrice != null) {
        if (p.price > prevPrice) trend = 'up'
        else if (p.price < prevPrice) trend = 'down'
      }
      const baseName = p.name.replace(/\s*(カートン|ボックス)\s*$/i, '').trim()
      const cartonPrice = cartonPriceMap.get(baseName) ?? null
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

// --- ONE PIECE DESIGN: Deep Navy × Gold × Red ---
const NAVY = '#0b2a4a'
const NAVY_DEEP = '#071a30'
const GOLD = '#f5c242'
const GOLD_DEEP = '#c48a1f'
const RED = '#b91c1c'
const CREAM = '#fef6e0'
const INK = '#0a0f1a'

const PriceImageCanvas = React.forwardRef<HTMLDivElement, {
  products: ProductWithTrend[]
}>(({ products }, ref) => {
  const today = new Date()
  const fmt = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  const updatedAt = fmt(today)

  // Layout
  const W = 1920
  const H = 1080
  const padX = 32
  const padY = 24
  const headerH = 220
  const footerH = 28
  const lineH = 5
  const gap = 8

  const gridTop = padY + headerH + 10 + lineH + 14
  const gridBottom = H - padY - footerH - 10
  const gridH = gridBottom - gridTop
  const gridW = W - padX * 2

  const cols = COLS
  const rows = Math.ceil(products.length / cols)
  const cellW = Math.floor((gridW - gap * (cols - 1)) / cols)
  const cellH = Math.floor((gridH - gap * (rows - 1)) / rows)

  // Card sizes
  const nameH = Math.max(Math.min(Math.floor(cellH * 0.16), 34), 14)
  const priceH = Math.max(Math.min(Math.floor(cellH * 0.2), 36), 20)
  const cardPad = 7
  const imgH = Math.max(cellH - nameH - priceH - cardPad - 6, 10)
  const nameFontSize = Math.max(Math.min(Math.floor(nameH * 0.55), 15), 9)
  const priceFontSize = Math.max(Math.min(Math.floor(priceH * 0.72), 26), 14)

  // Extract code prefix from product name (e.g. "OP-1 ROMANCE DOWN ボックス" → "OP-01")
  function getCode(name: string): string | null {
    const m = name.match(/^(OP|EB|PRB)-?(\d+)/i)
    if (!m) return null
    return `${m[1].toUpperCase()}-${m[2].padStart(2, '0')}`
  }
  // Strip code and "ボックス" from name for display
  function getDisplayName(name: string): string {
    return name.replace(/^(OP|EB|PRB)-?\d+\s*/i, '').replace(/\s*ボックス$/i, '').trim()
  }

  return (
    <div
      ref={ref}
      style={{
        width: W, height: H,
        position: 'relative', overflow: 'hidden',
        fontFamily: '"Noto Sans JP", sans-serif',
        boxSizing: 'border-box',
        background: `radial-gradient(ellipse at 50% 0%, #1a4a7a 0%, ${NAVY} 45%, ${NAVY_DEEP} 100%)`,
        color: CREAM,
      }}
    >
      {/* Wave pattern background */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.08, pointerEvents: 'none' }} viewBox="0 0 1920 1080" preserveAspectRatio="none">
        <defs>
          <pattern id="opWaves" x="0" y="0" width="160" height="80" patternUnits="userSpaceOnUse">
            <path d="M0 40 Q 40 10, 80 40 T 160 40" stroke={GOLD} strokeWidth="2" fill="none" />
            <path d="M0 60 Q 40 30, 80 60 T 160 60" stroke={GOLD} strokeWidth="1.5" fill="none" opacity="0.6" />
          </pattern>
        </defs>
        <rect width="1920" height="1080" fill="url(#opWaves)" />
      </svg>

      {/* Compass rose decoration (top-right) */}
      <svg style={{ position: 'absolute', top: -40, right: -40, width: 300, height: 300, opacity: 0.1, pointerEvents: 'none' }} viewBox="-100 -100 200 200">
        <g stroke={GOLD} strokeWidth="1.5" fill="none">
          <circle r="90" /><circle r="70" /><circle r="50" />
          {Array.from({ length: 16 }).map((_, i) => { const a = (i * 360 / 16) * Math.PI / 180; return <line key={i} x1={Math.cos(a) * 50} y1={Math.sin(a) * 50} x2={Math.cos(a) * 90} y2={Math.sin(a) * 90} /> })}
          {[0, 90, 180, 270].map(deg => { const a = deg * Math.PI / 180; return <polygon key={deg} points={`${Math.cos(a) * 95},${Math.sin(a) * 95} ${Math.cos(a + 0.08) * 40},${Math.sin(a + 0.08) * 40} ${Math.cos(a - 0.08) * 40},${Math.sin(a - 0.08) * 40}`} fill={GOLD} /> })}
        </g>
      </svg>

      {/* Helm decoration (bottom-left) */}
      <svg style={{ position: 'absolute', bottom: -50, left: -50, width: 260, height: 260, opacity: 0.1, pointerEvents: 'none' }} viewBox="-100 -100 200 200">
        <g stroke={GOLD} strokeWidth="2" fill="none">
          <circle r="80" /><circle r="60" /><circle r="20" fill={GOLD} />
          {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => { const a = deg * Math.PI / 180; return <line key={deg} x1={Math.cos(a) * 20} y1={Math.sin(a) * 20} x2={Math.cos(a) * 95} y2={Math.sin(a) * 95} /> })}
        </g>
      </svg>

      {/* Header */}
      <header style={{
        position: 'absolute', top: padY, left: padX, right: padX, height: headerH,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        zIndex: 2, gap: 18,
      }}>
        {/* Logo in gold circle frame */}
        <div style={{
          width: 210, height: 210, borderRadius: '50%',
          background: CREAM, border: `5px solid ${GOLD}`,
          boxShadow: `0 0 0 3px ${NAVY_DEEP}, 0 10px 30px rgba(0,0,0,0.4)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', flexShrink: 0,
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logo-full.png" alt="買取スクエア" style={{ height: 180, width: 180, objectFit: 'contain' }} crossOrigin="anonymous" />
          <div style={{
            position: 'absolute', bottom: -14, left: '50%', transform: 'translateX(-50%)',
            background: RED, color: CREAM, padding: '3px 16px',
            fontSize: 13, fontWeight: 900, letterSpacing: '0.3em',
            border: `2px solid ${GOLD}`, borderRadius: 2, whiteSpace: 'nowrap',
            boxShadow: '0 3px 6px rgba(0,0,0,0.4)',
          }}>KAITORI SQUARE</div>
        </div>

        {/* Title */}
        <div style={{ position: 'relative', flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 190 }}>
          <svg viewBox="-100 -100 200 200" style={{ position: 'absolute', width: 680, height: 220, opacity: 0.7, pointerEvents: 'none' }}>
            <defs>
              <radialGradient id="opGoldBurst"><stop offset="0%" stopColor={GOLD} stopOpacity="0" /><stop offset="42%" stopColor={GOLD} stopOpacity="0" /><stop offset="100%" stopColor={GOLD} stopOpacity="0.55" /></radialGradient>
              <mask id="opGoldMask"><rect x="-100" y="-100" width="200" height="200" fill="white" />{Array.from({ length: 24 }).map((_, i) => { const a = (i * 360 / 24) * Math.PI / 180; const a2 = ((i + 0.5) * 360 / 24) * Math.PI / 180; return <polygon key={i} points={`0,0 ${Math.cos(a) * 140},${Math.sin(a) * 140} ${Math.cos(a2) * 140},${Math.sin(a2) * 140}`} fill="black" /> })}</mask>
            </defs>
            <circle cx="0" cy="0" r="140" fill="url(#opGoldBurst)" mask="url(#opGoldMask)" />
          </svg>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, transform: 'rotate(-2deg)' }}>
            <div style={{ color: GOLD, fontSize: 60, fontWeight: 900, WebkitTextStroke: `4px ${INK}`, paintOrder: 'stroke fill', filter: `drop-shadow(4px 4px 0 ${INK})` }}>★</div>
            <h1 style={{ margin: 0, fontSize: 152, fontWeight: 900, lineHeight: 0.92, letterSpacing: '0.04em', color: GOLD, WebkitTextStroke: `12px ${INK}`, paintOrder: 'stroke fill', textShadow: `0 0 0 ${INK}, 10px 10px 0 ${RED}, 16px 16px 0 ${INK}`, whiteSpace: 'nowrap' }}>高価買取</h1>
            <div style={{ color: GOLD, fontSize: 60, fontWeight: 900, WebkitTextStroke: `4px ${INK}`, paintOrder: 'stroke fill', filter: `drop-shadow(4px 4px 0 ${INK})` }}>★</div>
            <div style={{ position: 'absolute', top: -48, left: '50%', transform: 'translateX(-50%)', background: RED, color: CREAM, padding: '5px 24px', fontSize: 22, fontWeight: 900, letterSpacing: '0.2em', border: `3px solid ${GOLD}`, boxShadow: `4px 4px 0 ${INK}`, whiteSpace: 'nowrap', borderRadius: 2 }}>
              ワンピースカードBOX 買取価格表
            </div>
          </div>
        </div>

        {/* Badges — vertical */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flexShrink: 0, minWidth: 260 }}>
          <div style={{ background: CREAM, border: `3px solid ${INK}`, padding: '9px 16px', borderRadius: 10, transform: 'rotate(3deg)', boxShadow: `5px 5px 0 ${GOLD_DEEP}`, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: RED, lineHeight: 1, letterSpacing: '0.08em' }}>★ 全種 ★</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: INK, lineHeight: 1.05, marginTop: 3 }}>取扱！</div>
          </div>
          <div style={{ background: INK, color: GOLD, padding: '9px 16px', borderRadius: 10, transform: 'rotate(-2deg)', boxShadow: `5px 5px 0 ${RED}`, border: `3px solid ${GOLD}`, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: CREAM, letterSpacing: '0.25em', opacity: 0.85 }}>FAST PAYMENT</div>
            <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.05, marginTop: 2 }}>到着日振込！</div>
          </div>
          <div style={{ background: RED, color: CREAM, padding: '9px 16px', borderRadius: 10, transform: 'rotate(2.5deg)', boxShadow: `5px 5px 0 ${INK}`, border: `3px solid ${GOLD}`, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: GOLD, letterSpacing: '0.25em' }}>FREE SHIPPING</div>
            <div style={{ fontSize: 25, fontWeight: 900, lineHeight: 1.05, marginTop: 2 }}>着払<span style={{ fontSize: 32, color: GOLD }}>10</span>箱〜</div>
          </div>
        </div>
      </header>

      {/* Gold gradient line */}
      <div style={{ position: 'absolute', top: padY + headerH + 10, left: padX, right: padX, height: lineH, background: `linear-gradient(90deg, ${GOLD_DEEP} 0%, ${GOLD} 50%, ${GOLD_DEEP} 100%)`, boxShadow: `0 2px 0 ${INK}`, zIndex: 2 }} />

      {/* Product cards */}
      {products.map((product, index) => {
        const col = index % cols
        const row = Math.floor(index / cols)
        const x = padX + col * (cellW + gap)
        const y = gridTop + row * (cellH + gap)
        const code = getCode(product.name)
        const displayName = getDisplayName(product.name)
        return (
          <div key={product.id} style={{
            position: 'absolute', left: x, top: y, width: cellW, height: cellH,
            background: CREAM, border: `2.5px solid ${INK}`, borderRadius: 6,
            padding: `${cardPad}px ${cardPad}px 0`,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden', boxShadow: `3px 3px 0 ${GOLD_DEEP}`, zIndex: 2,
            boxSizing: 'border-box',
          }}>
            {/* Code badge */}
            {code && (
              <div style={{
                position: 'absolute', top: 5, left: 5,
                background: NAVY, color: GOLD,
                fontSize: 10, fontWeight: 900, letterSpacing: '0.05em',
                padding: '1px 6px', borderRadius: 3,
                border: `1.5px solid ${GOLD}`, zIndex: 3,
                fontFamily: "'Inter', 'Noto Sans JP', sans-serif",
              }}>{code}</div>
            )}
            {/* Product image */}
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image_url} alt={product.name} style={{ width: '100%', height: imgH, objectFit: 'contain' }} crossOrigin="anonymous" />
            ) : (
              <div style={{ width: '100%', height: imgH, background: `rgba(11,42,74,0.08)`, border: `1px dashed rgba(11,42,74,0.25)`, borderRadius: 4 }} />
            )}
            {/* Name */}
            <div style={{
              fontSize: nameFontSize, fontWeight: 800, color: INK, textAlign: 'center',
              lineHeight: 1.15, height: nameH, marginTop: 2,
              overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{displayName}</div>
            {/* Price */}
            <div style={{
              marginLeft: -cardPad, marginRight: -cardPad,
              background: `linear-gradient(180deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`,
              height: priceH, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderTop: `2px solid ${GOLD}`,
            }}>
              {product.price_no_shrink != null ? (
                <span style={{ color: GOLD, fontSize: Math.floor(priceFontSize * 0.82), fontWeight: 900, lineHeight: 1, textShadow: `0 1px 0 ${INK}` }}>
                  ¥{product.price.toLocaleString('ja-JP')}<span style={{ color: 'rgba(245,194,66,0.4)', margin: '0 2px' }}>/</span><span style={{ color: 'rgba(254,246,224,0.7)' }}>¥{product.price_no_shrink.toLocaleString('ja-JP')}<span style={{ fontSize: Math.floor(priceFontSize * 0.4), marginLeft: 1 }}>CT</span></span>
                </span>
              ) : (
                <span style={{ color: GOLD, fontSize: priceFontSize, fontWeight: 900, lineHeight: 1, textShadow: `0 1px 0 ${INK}` }}>
                  ¥{product.price.toLocaleString('ja-JP')}
                </span>
              )}
            </div>
          </div>
        )
      })}

      {/* Footer */}
      <footer style={{
        position: 'absolute', bottom: padY, left: padX, right: padX, height: footerH,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 14, color: CREAM, fontWeight: 600, zIndex: 2,
      }}>
        <span>※ 買取価格は状態・在庫状況により変動する場合がございます。</span>
        <span style={{ fontWeight: 900, color: GOLD, letterSpacing: '0.05em' }}>更新日：{updatedAt}</span>
      </footer>
    </div>
  )
})
PriceImageCanvas.displayName = 'PriceImageCanvas'
