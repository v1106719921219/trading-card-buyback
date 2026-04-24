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

const SETTING_KEY = 'sns_psa10_default_products'
const CATEGORY_ID = 'db02ec12-d529-453c-a749-53da99e05533'
const PSA10_SUBCATEGORY_ID = '8b34c75d-d7f8-4393-89fe-7685b3f61e5b'
const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const COLS = 6
const MAX_PER_PAGE = 42

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

export default function PSA10ImagePage() {
  const [products, setProducts] = useState<ProductWithRelations[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [saving, setSaving] = useState(false)
  const previewRef1 = useRef<HTMLDivElement>(null)
  const previewRef2 = useRef<HTMLDivElement>(null)
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
    const { data: existing } = await supabase.from('app_settings').select('key').eq('key', SETTING_KEY).maybeSingle()
    let error
    if (existing) {
      ({ error } = await supabase.from('app_settings').update({ value }).eq('key', SETTING_KEY))
    } else {
      ({ error } = await supabase.from('app_settings').insert({ key: SETTING_KEY, value, description: 'PSA10買取画像のデフォルト掲載商品IDリスト', tenant_id: TENANT_ID }))
    }
    setSaving(false)
    if (error) toast.error('保存に失敗しました')
    else toast.success('デフォルト選択を保存しました')
  }

  async function downloadRef(ref: React.RefObject<HTMLDivElement | null>, filename: string) {
    if (!ref.current) return
    const { toPng } = await import('html-to-image')
    const options = { quality: 1, pixelRatio: 2 }
    await toPng(ref.current, options) // warm up
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
      await document.fonts.load('900 16px "Inter"')
      await document.fonts.ready

      const dateStr = new Date().toLocaleDateString('ja-JP').replace(/\//g, '')
      if (page2Products.length > 0) {
        await downloadRef(previewRef1, `PSA10買取表_1_${dateStr}.png`)
        await downloadRef(previewRef2, `PSA10買取表_2_${dateStr}.png`)
        toast.success('2枚の画像をダウンロードしました')
      } else {
        await downloadRef(previewRef1, `PSA10買取表_${dateStr}.png`)
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

  const needsSplit = selectedProducts.length > MAX_PER_PAGE
  const splitAt = needsSplit ? Math.ceil(selectedProducts.length / 2) : selectedProducts.length
  const page1Products = selectedProducts.slice(0, splitAt)
  const page2Products = needsSplit ? selectedProducts.slice(splitAt) : []

  return (
    <div>
      <AdminHeader
        title="PSA10買取画像生成"
        description="PSA10鑑定カードの買取価格画像を自動生成します（1920×1080）"
      />

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Left: product selection */}
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
              プレビュー（1920×1080）{needsSplit && '— 2枚に分割'}
            </p>
            <Button onClick={handleDownload} disabled={downloading || selectedIds.size === 0} className="gap-2">
              <Download className="h-4 w-4" />
              {downloading ? '生成中...' : needsSplit ? '2枚ダウンロード' : 'PNG ダウンロード'}
            </Button>
          </div>

          <div className="border rounded-lg bg-muted/30" style={{ width: Math.ceil(1920 * 0.35), height: Math.ceil(1080 * 0.35), overflow: 'hidden', position: 'relative' }}>
            <div style={{ transform: 'scale(0.35)', transformOrigin: 'top left', width: '1920px', height: '1080px', position: 'absolute', top: 0, left: 0 }}>
              <PSA10Canvas ref={previewRef1} products={page1Products} pageLabel={needsSplit ? '①' : undefined} />
            </div>
          </div>

          {page2Products.length > 0 && (
            <>
              <p className="text-sm text-muted-foreground">2枚目</p>
              <div className="border rounded-lg bg-muted/30" style={{ width: Math.ceil(1920 * 0.35), height: Math.ceil(1080 * 0.35), overflow: 'hidden', position: 'relative' }}>
                <div style={{ transform: 'scale(0.35)', transformOrigin: 'top left', width: '1920px', height: '1080px', position: 'absolute', top: 0, left: 0 }}>
                  <PSA10Canvas ref={previewRef2} products={page2Products} pageLabel="②" />
                </div>
              </div>
            </>
          )}
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

// --- PSA10 Canvas (1920x1080) ---
const PSA10Canvas = React.forwardRef<HTMLDivElement, {
  products: ProductWithRelations[]
  pageLabel?: string
}>(({ products, pageLabel }, ref) => {
  const today = new Date()
  const month = today.getMonth() + 1
  const day = today.getDate()
  const updatedDateStr = `${month}月${day}日 更新`

  const fmt = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  const updatedAt = fmt(today)

  const W = 1920
  const H = 1080
  const padX = 22
  const padY = 18
  const headerH = 84
  const footerH = 28
  const gap = 2

  const gridTop = padY + headerH + 8 + 8
  const gridH = H - gridTop - padY - footerH - 4
  const gridW = W - padX * 2

  const cols = COLS
  const rows = Math.ceil(products.length / cols)

  const cellW = Math.floor((gridW - gap * (cols - 1)) / cols)
  const cellH = rows > 0 ? Math.floor((gridH - gap * (rows - 1)) / rows) : 0

  // Card inner layout
  const nameH = Math.max(Math.min(Math.floor(cellH * 0.14), 28), 12)
  const priceBarH = Math.max(Math.min(Math.floor(cellH * 0.16), 30), 18)
  const nameFontSize = Math.max(Math.min(Math.floor(nameH * 0.65), 11), 8)
  const priceFontSize = Math.max(Math.min(Math.floor(priceBarH * 0.8), 24), 14)
  const badgeSize = Math.max(Math.min(Math.floor(cellW * 0.18), 40), 24)
  const psaLogoSize = Math.floor(badgeSize * 0.8)

  return (
    <div
      ref={ref}
      style={{
        width: W,
        height: H,
        background: 'radial-gradient(ellipse at 50% 0%, #1a1408 0%, #000 60%)',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: '"Noto Sans JP", sans-serif',
        boxSizing: 'border-box',
        color: '#fff',
      }}
    >
      {/* Background: gold diamond pattern */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.08, pointerEvents: 'none' }} viewBox="0 0 1920 1080" preserveAspectRatio="none">
        <defs>
          <pattern id="psa10-pat" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M20 0 L40 20 L20 40 L0 20 Z" stroke={P.BASE} strokeWidth="0.5" fill="none" />
          </pattern>
        </defs>
        <rect width="1920" height="1080" fill="url(#psa10-pat)" />
      </svg>

      {/* Corner gold glow */}
      <div style={{
        position: 'absolute', top: -200, right: -200, width: 600, height: 600,
        background: `radial-gradient(circle, ${P.BASE}44 0%, transparent 60%)`,
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -200, left: -200, width: 500, height: 500,
        background: `radial-gradient(circle, ${P.BASE}33 0%, transparent 60%)`,
        pointerEvents: 'none',
      }} />

      {/* Sparkles */}
      {[
        { top: 90, left: 200, size: 20 },
        { top: 50, right: 340, size: 14 },
        { top: 140, right: 500, size: 18 },
        { bottom: 70, left: 300, size: 16 },
        { bottom: 120, right: 280, size: 22 },
        { top: 500, left: 12, size: 14 },
        { top: 700, right: 10, size: 16 },
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
        display: 'flex', alignItems: 'center', gap: 16, zIndex: 4,
      }}>
        {/* Logo */}
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: '#fff', padding: 3,
          boxShadow: `0 0 0 3px ${P.BASE}, 0 0 0 5px #111, 0 0 20px ${P.BASE}99, 0 4px 12px rgba(0,0,0,0.4)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', flexShrink: 0,
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logo-full.png" alt="買取スクエア" style={{ height: 64, width: 64, objectFit: 'contain' }} crossOrigin="anonymous" />
          <div style={{
            position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)',
            background: RED, color: '#fff', padding: '1px 8px',
            fontSize: 7, fontWeight: 900, letterSpacing: '0.2em',
            border: `1.5px solid ${P.BASE}`, borderRadius: 2, whiteSpace: 'nowrap',
          }}>KAITORI SQUARE</div>
        </div>

        {/* Title - use text-shadow instead of WebkitTextStroke+BackgroundClip */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <h1 style={{
            margin: 0,
            fontSize: 48, fontWeight: 900,
            letterSpacing: '0.04em',
            lineHeight: 1,
            whiteSpace: 'nowrap',
            color: P.BASE,
            textShadow: `0 0 8px ${P.BASE}88, 0 2px 0 #3a2c10, 0 4px 8px rgba(212,168,83,0.5)`,
          }}>
            PSA10買取表{pageLabel ? ` ${pageLabel}` : ''}
          </h1>
        </div>

        {/* Update date badge */}
        <div style={{
          background: 'linear-gradient(180deg, #dc2626 0%, #b91c1c 50%, #7f1d1d 100%)',
          color: '#fff',
          padding: '7px 18px', fontSize: 16, fontWeight: 900,
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
        const x = padX + col * (cellW + gap)
        const y = gridTop + row * (cellH + gap)
        const wantedQty = product.wanted_quantity ?? 5

        return (
          <div key={product.id} style={{
            position: 'absolute', left: x, top: y, width: cellW, height: cellH,
            background: '#0a0a0a',
            overflow: 'hidden', zIndex: 2,
            boxSizing: 'border-box',
          }}>
            {/* Card image */}
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image_url}
                alt={product.name}
                style={{
                  position: 'absolute', inset: 0,
                  width: '100%', height: '100%',
                  objectFit: 'cover',
                }}
                crossOrigin="anonymous"
              />
            ) : (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'repeating-linear-gradient(135deg, #111 0 8px, #181818 8px 16px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'rgba(212,168,83,0.35)', fontSize: 12,
                fontWeight: 700, letterSpacing: '0.2em',
              }}>
                CARD IMAGE
              </div>
            )}

            {/* Top right: PSA10 logo */}
            <div style={{
              position: 'absolute', top: 6, right: 6, zIndex: 5,
              width: badgeSize, height: badgeSize,
              borderRadius: '50%',
              background: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 0 1.5px ${P.BASE}, 0 2px 6px rgba(0,0,0,0.6)`,
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/psa10-logo.png" alt="PSA10" style={{
                width: psaLogoSize, height: psaLogoSize, objectFit: 'contain',
              }} crossOrigin="anonymous" />
            </div>

            {/* Top left: wanted quantity */}
            <div style={{
              position: 'absolute', top: 6, left: 6, zIndex: 3,
              background: 'rgba(0,0,0,0.85)',
              color: P.LIGHT,
              padding: '2px 7px',
              fontSize: 11, fontWeight: 900,
              letterSpacing: '0.05em',
              border: `1px solid ${P.BASE}`,
              borderRadius: 2,
              boxShadow: `0 0 8px rgba(212,168,83,0.4)`,
            }}>
              {wantedQty}点募集
            </div>

            {/* Bottom: name + price */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 3,
              background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.88) 40%, #000 100%)',
              padding: '24px 4px 0',
            }}>
              <div style={{
                fontSize: nameFontSize, fontWeight: 700, color: P.LIGHT,
                textAlign: 'center', lineHeight: 1.15,
                minHeight: nameH, display: 'flex', alignItems: 'flex-end',
                justifyContent: 'center',
                padding: '0 2px 4px',
                letterSpacing: '0.01em',
                textShadow: '0 1px 2px rgba(0,0,0,0.9)',
              }}>
                {product.name}
              </div>
              <div style={{
                background: 'linear-gradient(180deg, #dc2626 0%, #b91c1c 50%, #7f1d1d 100%)',
                color: '#fff',
                textAlign: 'center',
                fontSize: priceFontSize, fontWeight: 900,
                padding: '4px 2px',
                letterSpacing: '-0.01em',
                borderTop: `1px solid ${P.BASE}`,
                fontFamily: "'Inter', sans-serif",
                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
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
        <span style={{ marginLeft: 20, fontWeight: 900 }}>更新日：{updatedAt}</span>
      </footer>
    </div>
  )
})
PSA10Canvas.displayName = 'PSA10Canvas'
