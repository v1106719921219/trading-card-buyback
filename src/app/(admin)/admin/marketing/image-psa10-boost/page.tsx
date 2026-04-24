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

const SETTING_KEY = 'sns_psa10_boost_default_products'
const CATEGORY_ID = 'db02ec12-d529-453c-a749-53da99e05533'
const PSA10_SUBCATEGORY_ID = '8b34c75d-d7f8-4393-89fe-7685b3f61e5b'
const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const COLS = 3

// Gold palette
const P = {
  WHITE: '#fffbe8',
  LIGHT: '#fde8a4',
  BASE: '#e8c25c',
  MID: '#d4a853',
  DARK: '#8a6a2a',
  DEEP: '#5a4518',
}
const RED = '#b91c1c'

const GOLD_TEXT_GRADIENT = `linear-gradient(180deg, #fffbe8 0%, #fde8a4 18%, #e8c25c 35%, #d4a853 50%, #8a6a2a 65%, #e8c25c 82%, #fde8a4 100%)`
const GOLD_METAL_GRADIENT = `linear-gradient(180deg, #fde8a4 0%, #e8c25c 25%, #d4a853 50%, #a88035 75%, #8a6a2a 100%)`

type ProductWithRelations = Product & {
  category: Category | null
  subcategory: Subcategory | null
}

export default function PSA10BoostImagePage() {
  const [products, setProducts] = useState<ProductWithRelations[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [saving, setSaving] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700;800;900&family=Inter:wght@700;800;900&display=block'
    document.head.appendChild(link)
    return () => { document.head.removeChild(link) }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [productsResult, settingResult] = await Promise.all([
      supabase
        .from('products')
        .select('*, category:categories(*), subcategory:subcategories(*)')
        .eq('is_active', true)
        .eq('category_id', CATEGORY_ID)
        .eq('subcategory_id', PSA10_SUBCATEGORY_ID)
        .order('price', { ascending: false }),
      supabase.from('app_settings').select('value').eq('key', SETTING_KEY).maybeSingle(),
    ])

    if (productsResult.error) {
      toast.error('商品の取得に失敗しました')
      setLoading(false)
      return
    }

    const prods = (productsResult.data || []) as ProductWithRelations[]
    setProducts(prods)

    if (settingResult.data?.value) {
      try {
        const savedIds: string[] = JSON.parse(settingResult.data.value)
        setSelectedIds(new Set(savedIds.filter((id) => prods.some((p) => p.id === id))))
      } catch {
        // Default to first 6
        setSelectedIds(new Set(prods.slice(0, 6).map((p) => p.id)))
      }
    } else {
      setSelectedIds(new Set(prods.slice(0, 6).map((p) => p.id)))
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
    const { data: existing } = await supabase.from('app_settings').select('key').eq('key', SETTING_KEY).maybeSingle()
    let error
    if (existing) {
      ({ error } = await supabase.from('app_settings').update({ value }).eq('key', SETTING_KEY))
    } else {
      ({ error } = await supabase.from('app_settings').insert({ key: SETTING_KEY, value, description: 'PSA10強化買取画像のデフォルト掲載商品IDリスト', tenant_id: TENANT_ID }))
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
      await document.fonts.load('900 16px "Inter"')
      await document.fonts.ready

      const { toPng } = await import('html-to-image')
      const options = { quality: 1, pixelRatio: 2 }
      await toPng(previewRef.current, options) // warm up
      const dataUrl = await toPng(previewRef.current, options)

      const dateStr = new Date().toLocaleDateString('ja-JP').replace(/\//g, '')
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `PSA10強化買取_${dateStr}.png`
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
        title="PSA10強化買取画像生成"
        description="PSA10買取強化の画像を自動生成します（1920×1080 / 3列）"
      />

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Left: product selection */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">掲載する商品（3〜9件推奨）</CardTitle>
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
              {selectedIds.size > 9 && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠ 9件以上選択されています。3〜9件を推奨します。
                </p>
              )}
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

        {/* Right: preview */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              プレビュー（1920×1080）
            </p>
            <Button onClick={handleDownload} disabled={downloading || selectedIds.size === 0} className="gap-2">
              <Download className="h-4 w-4" />
              {downloading ? '生成中...' : 'PNG ダウンロード'}
            </Button>
          </div>

          <div className="border rounded-lg bg-muted/30" style={{ width: Math.ceil(1920 * 0.35), height: Math.ceil(1080 * 0.35), overflow: 'hidden', position: 'relative' }}>
            <div style={{ transform: 'scale(0.35)', transformOrigin: 'top left', width: '1920px', height: '1080px', position: 'absolute', top: 0, left: 0 }}>
              <PSA10BoostCanvas ref={previewRef} products={selectedProducts} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Sparkle SVG ---
function Sparkle({ size = 24, color = '#fffbe8' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="-50 -50 100 100" style={{ filter: `drop-shadow(0 0 4px ${color})` }}>
      <path d="M0 -50 L8 -8 L50 0 L8 8 L0 50 L-8 8 L-50 0 L-8 -8 Z" fill={color} />
      <circle cx="0" cy="0" r="3" fill="#fff" />
    </svg>
  )
}

// --- PSA10 Boost Canvas (1920x1080) ---
const PSA10BoostCanvas = React.forwardRef<HTMLDivElement, {
  products: ProductWithRelations[]
}>(({ products }, ref) => {
  const today = new Date()
  const month = today.getMonth() + 1
  const day = today.getDate()
  const updatedDateStr = `${month}月${day}日 更新`

  const W = 1920
  const H = 1080
  const padX = 26
  const padY = 20
  const headerH = 150
  const footerH = 30
  const cardGap = 10

  const gridTop = padY + headerH + 14
  const gridH = H - gridTop - padY - footerH - 10
  const gridW = W - padX * 2

  const cols = COLS
  const rows = Math.max(Math.ceil(products.length / cols), 1)

  const cellW = Math.floor((gridW - cardGap * (cols - 1)) / cols)
  const cellH = Math.floor((gridH - cardGap * (rows - 1)) / rows)

  // Card inner layout
  const imgAreaH = Math.floor(cellH * 0.62)
  const nameAreaH = Math.floor(cellH * 0.14)
  const priceBarH = Math.floor(cellH * 0.20)
  const cardPad = 6

  const nameFontSize = Math.max(Math.min(Math.floor(nameAreaH * 0.7), 16), 10)
  const priceFontSize = Math.max(Math.min(Math.floor(priceBarH * 0.72), 46), 20)
  const psaBadgeSize = Math.max(Math.min(Math.floor(cellW * 0.13), 70), 36)
  const psaLogoSize = Math.floor(psaBadgeSize * 0.83)

  return (
    <div
      ref={ref}
      style={{
        width: W,
        height: H,
        background: `
          radial-gradient(ellipse 60% 40% at 50% 50%, rgba(212,168,83,0.22) 0%, rgba(212,168,83,0) 70%),
          radial-gradient(ellipse at 50% 0%, #1f1a0e 0%, #0a0805 50%, #000 100%)
        `,
        color: '#fff',
        fontFamily: '"Noto Sans JP", sans-serif',
        position: 'relative',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Background: gold dot pattern */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.15 }} viewBox="0 0 1920 1080" preserveAspectRatio="none">
        <defs>
          <pattern id="boost-dots" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx="16" cy="16" r="0.8" fill={P.BASE} />
          </pattern>
        </defs>
        <rect width="1920" height="1080" fill="url(#boost-dots)" />
      </svg>

      {/* Background: gold burst lines */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.4 }} viewBox="-960 -540 1920 1080" preserveAspectRatio="none">
        <defs>
          <radialGradient id="boost-fade">
            <stop offset="0%" stopColor={P.BASE} stopOpacity={0} />
            <stop offset="55%" stopColor={P.BASE} stopOpacity={0} />
            <stop offset="100%" stopColor={P.LIGHT} stopOpacity={0.55} />
          </radialGradient>
          <mask id="boost-mask">
            <rect x="-960" y="-540" width="1920" height="1080" fill="white" />
            {Array.from({ length: 120 }).map((_, i) => {
              const a = (i * 360 / 120) * Math.PI / 180
              const a2 = ((i + 0.35) * 360 / 120) * Math.PI / 180
              return <polygon key={i} points={`0,0 ${Math.cos(a) * 1400},${Math.sin(a) * 1400} ${Math.cos(a2) * 1400},${Math.sin(a2) * 1400}`} fill="black" />
            })}
          </mask>
        </defs>
        <rect x="-960" y="-540" width="1920" height="1080" fill="url(#boost-fade)" mask="url(#boost-mask)" />
      </svg>

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.8) 100%)',
      }} />

      {/* Sparkles */}
      {[
        { top: 40, left: 220, size: 24 },
        { top: 80, right: 380, size: 18 },
        { top: 180, right: 200, size: 22 },
        { top: 160, left: 400, size: 16 },
        { bottom: 60, left: 280, size: 20 },
        { bottom: 120, right: 320, size: 26 },
        { top: 480, left: 40, size: 18 },
        { top: 620, right: 30, size: 22 },
        { top: 850, left: 900, size: 18 },
      ].map((sp, i) => (
        <div key={i} style={{
          position: 'absolute',
          top: 'top' in sp ? sp.top : undefined,
          bottom: 'bottom' in sp ? sp.bottom : undefined,
          left: 'left' in sp ? sp.left : undefined,
          right: 'right' in sp ? sp.right : undefined,
          zIndex: 3, pointerEvents: 'none', opacity: 0.7,
        }}>
          <Sparkle size={sp.size} />
        </div>
      ))}

      {/* Header */}
      <header style={{
        position: 'absolute', top: padY, left: padX, right: padX, height: headerH,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 4,
      }}>
        {/* Logo (left absolute) */}
        <div style={{
          position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
          width: 110, height: 110, borderRadius: '50%',
          background: '#fff',
          boxShadow: `0 0 0 4px ${P.BASE}, 0 0 0 7px #111, 0 0 30px ${P.BASE}cc, 0 8px 20px rgba(0,0,0,0.5)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logo-full.png" alt="買取スクエア" style={{ height: 88, width: 88, objectFit: 'contain' }} crossOrigin="anonymous" />
        </div>

        {/* Center title */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, position: 'relative' }}>
          {/* Left sparkle decoration */}
          <div style={{ filter: 'drop-shadow(0 0 12px rgba(253,232,164,0.8))' }}>
            <Sparkle size={44} color="#fde8a4" />
          </div>

          {/* Title - use text-shadow for outline, NOT WebkitTextStroke with background-clip */}
          <h1 style={{
            margin: 0,
            fontSize: 108, fontWeight: 900,
            lineHeight: 1,
            letterSpacing: '0.08em',
            color: P.BASE,
            textShadow: `
              -3px -3px 0 #1a1408, 3px -3px 0 #1a1408, -3px 3px 0 #1a1408, 3px 3px 0 #1a1408,
              0 -3px 0 #1a1408, 0 3px 0 #1a1408, -3px 0 0 #1a1408, 3px 0 0 #1a1408,
              2px 3px 0 #000, 0 6px 20px rgba(232,194,92,0.6)
            `,
            whiteSpace: 'nowrap',
            fontFamily: '"Noto Sans JP", sans-serif',
          }}>
            買取強化中！
          </h1>

          {/* Right sparkle decoration */}
          <div style={{ filter: 'drop-shadow(0 0 12px rgba(253,232,164,0.8))' }}>
            <Sparkle size={44} color="#fde8a4" />
          </div>
        </div>

        {/* Update date (right absolute) */}
        <div style={{
          position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
          background: 'linear-gradient(180deg, #dc2626 0%, #b91c1c 50%, #7f1d1d 100%)',
          color: '#fff',
          padding: '9px 20px', fontSize: 17, fontWeight: 900,
          letterSpacing: '0.08em',
          border: `2px solid ${P.BASE}`,
          borderRadius: 4, whiteSpace: 'nowrap',
          boxShadow: '0 4px 10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.25)',
        }}>{updatedDateStr}</div>
      </header>

      {/* Product cards - absolute positioning */}
      {products.map((product, index) => {
        const col = index % cols
        const row = Math.floor(index / cols)
        const x = padX + col * (cellW + cardGap)
        const y = gridTop + row * (cellH + cardGap)
        const wantedQty = product.wanted_quantity ?? 5

        return (
          <div key={product.id} style={{
            position: 'absolute', left: x, top: y, width: cellW, height: cellH,
            background: 'linear-gradient(180deg, #1a1408 0%, #050300 100%)',
            overflow: 'hidden', zIndex: 4,
            border: `3px solid ${P.MID}`,
            borderRadius: 6,
            boxShadow: `
              0 0 0 1px #000,
              0 0 0 2px ${P.DEEP},
              0 10px 24px rgba(0,0,0,0.7),
              0 0 30px rgba(212,168,83,0.25),
              inset 0 0 20px rgba(212,168,83,0.08)
            `,
            boxSizing: 'border-box',
            padding: cardPad,
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Gold highlight on top */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              height: 2,
              background: `linear-gradient(90deg, transparent 0%, ${P.WHITE} 50%, transparent 100%)`,
              opacity: 0.6, pointerEvents: 'none',
            }} />

            {/* Card image area */}
            <div style={{
              height: imgAreaH,
              position: 'relative',
              borderRadius: 4,
              overflow: 'hidden',
              flexShrink: 0,
            }}>
              {product.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.image_url}
                  alt={product.name}
                  style={{
                    width: '100%', height: '100%',
                    objectFit: 'cover',
                  }}
                  crossOrigin="anonymous"
                />
              ) : (
                <div style={{
                  width: '100%', height: '100%',
                  background: 'repeating-linear-gradient(135deg, #0f0f0f 0 10px, #181818 10px 20px)',
                  border: `1.5px dashed rgba(212,168,83,0.35)`,
                  borderRadius: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ color: 'rgba(212,168,83,0.3)', fontSize: 16, fontWeight: 700, letterSpacing: '0.2em' }}>CARD IMAGE</span>
                </div>
              )}

              {/* Top left: wanted quantity */}
              <div style={{
                position: 'absolute', top: 8, left: 8,
                background: 'rgba(0,0,0,0.85)', color: P.LIGHT,
                padding: '3px 10px', fontSize: 13, fontWeight: 900,
                letterSpacing: '0.05em', border: `1px solid ${P.BASE}`,
                borderRadius: 2,
                boxShadow: `0 0 10px rgba(212,168,83,0.4)`,
              }}>{wantedQty}点募集</div>

              {/* Top right: PSA10 logo */}
              <div style={{
                position: 'absolute', top: 8, right: 8, zIndex: 5,
                width: psaBadgeSize, height: psaBadgeSize,
                borderRadius: '50%',
                background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 0 0 2px ${P.BASE}, 0 4px 10px rgba(0,0,0,0.6)`,
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/psa10-logo.png" alt="PSA10" style={{
                  width: psaLogoSize, height: psaLogoSize, objectFit: 'contain',
                }} crossOrigin="anonymous" />
              </div>

              {/* Bottom left sparkle */}
              <div style={{
                position: 'absolute', bottom: 8, left: 8, opacity: 0.7,
              }}>
                <Sparkle size={16} />
              </div>
            </div>

            {/* Bottom: name + price */}
            <div style={{ marginTop: 6, textAlign: 'center', position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <div style={{
                fontSize: nameFontSize, fontWeight: 800, color: P.LIGHT,
                lineHeight: 1.15, minHeight: nameAreaH,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px 4px',
              }}>
                {product.name}
              </div>
              {/* Gold metal price bar */}
              <div style={{
                position: 'relative',
                background: GOLD_METAL_GRADIENT,
                color: '#1a1408',
                fontSize: priceFontSize,
                fontWeight: 900,
                letterSpacing: '-0.01em',
                padding: '4px 6px',
                fontFamily: "'Inter', sans-serif",
                border: '2px solid #3a2c10',
                borderRadius: 4,
                boxShadow: `
                  0 4px 0 #000,
                  0 6px 14px rgba(0,0,0,0.6),
                  inset 0 2px 0 rgba(255,251,232,0.7),
                  inset 0 -2px 0 rgba(58,44,16,0.5),
                  inset 0 0 0 1px ${P.LIGHT}
                `,
                textShadow: '0 1px 0 rgba(255,251,232,0.6), 0 -1px 0 rgba(58,44,16,0.3)',
                textAlign: 'center',
                overflow: 'hidden',
              }}>
                ¥{product.price.toLocaleString('ja-JP')}
              </div>
            </div>
          </div>
        )
      })}

      {/* Footer */}
      <footer style={{
        position: 'absolute', bottom: padY, left: padX, right: padX, height: footerH,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, color: '#888',
        letterSpacing: '0.04em', zIndex: 4,
      }}>
        <span>※買取価格は日付当日限り有効です。相場や在庫状況によって予告なく変更になる場合がございます。</span>
        <span style={{
          marginLeft: 14,
          color: P.BASE,
          fontWeight: 900,
        }}>kaitorisquare.net</span>
      </footer>
    </div>
  )
})
PSA10BoostCanvas.displayName = 'PSA10BoostCanvas'
