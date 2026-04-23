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

const SETTING_KEY = 'sns_single_promo_default_products'
const CATEGORY_ID = 'db02ec12-d529-453c-a749-53da99e05533'
const SINGLE_SUBCATEGORY_ID = '19b8ce8e-1380-42ea-ba7a-0e2a0ad8a0b9'
const PROMO_SUBCATEGORY_ID = '14d18906-99e2-4efe-81bd-f7e6d0f1972c'

type ProductWithRelations = Product & {
  category: Category | null
  subcategory: Subcategory | null
}

export default function SinglePromoImagePage() {
  const [singles, setSingles] = useState<ProductWithRelations[]>([])
  const [promos, setPromos] = useState<ProductWithRelations[]>([])
  const [selectedSingleIds, setSelectedSingleIds] = useState<Set<string>>(new Set())
  const [selectedPromoIds, setSelectedPromoIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [saving, setSaving] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700;800;900&display=block'
    document.head.appendChild(link)
    return () => { document.head.removeChild(link) }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [singlesResult, promosResult, settingResult] = await Promise.all([
      supabase
        .from('products')
        .select('*, category:categories(*), subcategory:subcategories(*)')
        .eq('is_active', true)
        .eq('category_id', CATEGORY_ID)
        .eq('subcategory_id', SINGLE_SUBCATEGORY_ID)
        .order('sort_order'),
      supabase
        .from('products')
        .select('*, category:categories(*), subcategory:subcategories(*)')
        .eq('is_active', true)
        .eq('category_id', CATEGORY_ID)
        .eq('subcategory_id', PROMO_SUBCATEGORY_ID)
        .order('sort_order'),
      supabase.from('app_settings').select('value').eq('key', SETTING_KEY).maybeSingle(),
    ])

    if (singlesResult.error || promosResult.error) {
      toast.error('商品の取得に失敗しました')
      setLoading(false)
      return
    }

    const s = (singlesResult.data || []) as ProductWithRelations[]
    const p = (promosResult.data || []) as ProductWithRelations[]
    setSingles(s)
    setPromos(p)

    if (settingResult.data?.value) {
      try {
        const saved: { singles: string[]; promos: string[] } = JSON.parse(settingResult.data.value)
        setSelectedSingleIds(new Set(saved.singles.filter((id) => s.some((x) => x.id === id))))
        setSelectedPromoIds(new Set(saved.promos.filter((id) => p.some((x) => x.id === id))))
      } catch {
        setSelectedSingleIds(new Set(s.map((x) => x.id)))
        setSelectedPromoIds(new Set(p.map((x) => x.id)))
      }
    } else {
      setSelectedSingleIds(new Set(s.map((x) => x.id)))
      setSelectedPromoIds(new Set(p.map((x) => x.id)))
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchData() }, [fetchData])

  function toggleSingle(id: string) {
    setSelectedSingleIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function togglePromo(id: string) {
    setSelectedPromoIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function saveDefaults() {
    setSaving(true)
    const value = JSON.stringify({ singles: Array.from(selectedSingleIds), promos: Array.from(selectedPromoIds) })
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: SETTING_KEY, value, description: 'シングル・プロモ画像のデフォルト掲載商品' }, { onConflict: 'key' })
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
      a.download = `シングルプロモ買取価格表_${new Date().toLocaleDateString('ja-JP').replace(/\//g, '')}.png`
      a.click()
      toast.success('画像をダウンロードしました')
    } catch (e) {
      console.error(e)
      toast.error('画像の生成に失敗しました')
    } finally {
      setDownloading(false)
    }
  }

  const selectedSingles = singles.filter((p) => selectedSingleIds.has(p.id))
  const selectedPromos = promos.filter((p) => selectedPromoIds.has(p.id))
  const totalSelected = selectedSingles.length + selectedPromos.length

  return (
    <div>
      <AdminHeader
        title="シングル・プロモ価格画像生成"
        description="X投稿用のシングル＆プロモ買取価格画像を自動生成します（1920×1080）"
      />

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-4">
          {/* シングルカード選択 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">シングルカード</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{selectedSingleIds.size} 件</span>
                  <Button variant="ghost" size="icon" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <p className="text-sm text-muted-foreground">読み込み中...</p> : (
                <div className="space-y-1.5 max-h-[30vh] overflow-y-auto pr-1">
                  {singles.map((product) => (
                    <label key={product.id} className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted transition-colors">
                      <Checkbox checked={selectedSingleIds.has(product.id)} onCheckedChange={() => toggleSingle(product.id)} />
                      {product.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.image_url} alt="" className="w-8 h-8 object-cover rounded shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded border bg-muted flex items-center justify-center shrink-0"><ImageIcon className="h-4 w-4 text-muted-foreground/40" /></div>
                      )}
                      <span className="flex-1 text-sm truncate">{product.name}</span>
                      <Badge variant="secondary" className="shrink-0 tabular-nums text-xs">{product.price.toLocaleString('ja-JP')}円</Badge>
                    </label>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* プロモカード選択 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">プロモカード</CardTitle>
                <span className="text-sm text-muted-foreground">{selectedPromoIds.size} 件</span>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <p className="text-sm text-muted-foreground">読み込み中...</p> : (
                <div className="space-y-1.5 max-h-[30vh] overflow-y-auto pr-1">
                  {promos.map((product) => (
                    <label key={product.id} className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted transition-colors">
                      <Checkbox checked={selectedPromoIds.has(product.id)} onCheckedChange={() => togglePromo(product.id)} />
                      {product.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.image_url} alt="" className="w-8 h-8 object-cover rounded shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded border bg-muted flex items-center justify-center shrink-0"><ImageIcon className="h-4 w-4 text-muted-foreground/40" /></div>
                      )}
                      <span className="flex-1 text-sm truncate">{product.name}</span>
                      <Badge variant="secondary" className="shrink-0 tabular-nums text-xs">{product.price.toLocaleString('ja-JP')}円</Badge>
                    </label>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={saveDefaults} disabled={saving} className="gap-1">
              <Save className="h-3.5 w-3.5" />デフォルト保存
            </Button>
            <span className="text-sm text-muted-foreground self-center">計 {totalSelected} 件選択中</span>
          </div>
        </div>

        {/* プレビュー */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">プレビュー（1920×1080 / X推奨 16:9）</p>
            <Button onClick={handleDownload} disabled={downloading || totalSelected === 0} className="gap-2">
              <Download className="h-4 w-4" />
              {downloading ? '生成中...' : 'PNG ダウンロード'}
            </Button>
          </div>
          <div className="border rounded-lg bg-muted/30" style={{ width: Math.ceil(1920 * 0.35), height: Math.ceil(1080 * 0.35), overflow: 'hidden', position: 'relative' }}>
            <div style={{ transform: 'scale(0.35)', transformOrigin: 'top left', width: '1920px', height: '1080px', position: 'absolute', top: 0, left: 0 }}>
              <SinglePromoCanvas ref={previewRef} singles={selectedSingles} promos={selectedPromos} />
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

// --- Canvas (1920 × 1080) ---
const SinglePromoCanvas = React.forwardRef<HTMLDivElement, {
  singles: ProductWithRelations[]
  promos: ProductWithRelations[]
}>(({ singles, promos }, ref) => {
  const today = new Date()
  const fmt = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  const updatedAt = fmt(today)

  // Layout — match reference design
  const W = 1920
  const H = 1080
  const padX = 40
  const padY = 28
  const headerH = 260
  const footerH = 28
  const lineH = 4
  const sectionTitleH = 42
  const sectionGap = 12

  const contentTop = padY + headerH + 14 + lineH + 14
  const contentBottom = H - padY - footerH - 8
  const totalContentH = contentBottom - contentTop
  const gridW = W - padX * 2

  // Split sections evenly (50/50)
  const singleSectionH = Math.floor((totalContentH - sectionGap) / 2)
  const promoSectionH = totalContentH - sectionGap - singleSectionH

  const singleTop = contentTop
  const promoTop = contentTop + singleSectionH + sectionGap

  return (
    <div
      ref={ref}
      style={{
        width: W, height: H,
        background: '#FCD34D',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: '"Noto Sans JP", sans-serif',
        boxSizing: 'border-box',
      }}
    >
      {/* Palm leaf decorations */}
      <div style={{ position: 'absolute', top: -30, right: -30, opacity: 0.12, pointerEvents: 'none' }}>
        <PalmLeaf size={280} color="#1a1a1a" rotate={25} />
      </div>
      <div style={{ position: 'absolute', bottom: -40, left: -40, opacity: 0.1, pointerEvents: 'none' }}>
        <PalmLeaf size={260} color="#1a1a1a" rotate={-150} />
      </div>

      {/* Header — large, matching reference */}
      <header style={{
        position: 'absolute', top: padY, left: padX, right: padX, height: headerH,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        zIndex: 2, gap: 20,
      }}>
        {/* Logo — large */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/logo-full.png" alt="買取スクエア"
          style={{ height: 240, width: 240, objectFit: 'contain', display: 'block', flexShrink: 0 }}
          crossOrigin="anonymous"
        />

        {/* Title area */}
        <div style={{ position: 'relative', flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 170 }}>
          <svg viewBox="-100 -100 200 200" style={{ position: 'absolute', width: 640, height: 200, opacity: 0.85, pointerEvents: 'none' }}>
            <defs>
              <radialGradient id="burstFade2"><stop offset="0%" stopColor="#dc2626" stopOpacity="0" /><stop offset="40%" stopColor="#dc2626" stopOpacity="0" /><stop offset="100%" stopColor="#dc2626" stopOpacity="0.85" /></radialGradient>
              <mask id="burstMask2"><rect x="-100" y="-100" width="200" height="200" fill="white" />{Array.from({ length: 24 }).map((_, i) => { const a = (i * 360 / 24) * Math.PI / 180; const a2 = ((i + 0.5) * 360 / 24) * Math.PI / 180; return <polygon key={i} points={`0,0 ${Math.cos(a) * 140},${Math.sin(a) * 140} ${Math.cos(a2) * 140},${Math.sin(a2) * 140}`} fill="black" /> })}</mask>
            </defs>
            <circle cx="0" cy="0" r="140" fill="url(#burstFade2)" mask="url(#burstMask2)" />
          </svg>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, transform: 'rotate(-2.5deg)' }}>
            <div style={{ color: '#dc2626', fontSize: 60, fontWeight: 900, WebkitTextStroke: '4px #111', paintOrder: 'stroke fill', filter: 'drop-shadow(4px 4px 0 #111)' }}>★</div>
            <h1 style={{ margin: 0, fontSize: 160, fontWeight: 900, lineHeight: 0.92, letterSpacing: '0.04em', color: '#fff', WebkitTextStroke: '14px #111', paintOrder: 'stroke fill', textShadow: '0 0 0 #111, 10px 10px 0 #dc2626, 16px 16px 0 #111', whiteSpace: 'nowrap' }}>高価買取</h1>
            <div style={{ color: '#dc2626', fontSize: 60, fontWeight: 900, WebkitTextStroke: '4px #111', paintOrder: 'stroke fill', filter: 'drop-shadow(4px 4px 0 #111)' }}>★</div>
            <div style={{ position: 'absolute', top: -48, left: '50%', transform: 'translateX(-50%)', background: '#dc2626', color: '#fff', padding: '5px 24px', fontSize: 22, fontWeight: 900, letterSpacing: '0.2em', borderRadius: 2, whiteSpace: 'nowrap', border: '3px solid #111', boxShadow: '3px 3px 0 #111' }}>
              ポケモンカード シングル＆プロモ 買取価格表
            </div>
          </div>
        </div>

        {/* Right: 3 badges — vertical */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0, minWidth: 270 }}>
          <div style={{ background: '#fff', border: '3px solid #111', padding: '10px 18px', borderRadius: 10, transform: 'rotate(3deg)', boxShadow: '5px 5px 0 #111', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#dc2626', lineHeight: 1, letterSpacing: '0.05em' }}>★ 状態 ★</div>
            <div style={{ fontSize: 30, fontWeight: 900, color: '#111', lineHeight: 1.05, marginTop: 4 }}>美品買取強化！</div>
          </div>
          <div style={{ background: '#111', color: '#FCD34D', padding: '10px 18px', borderRadius: 10, transform: 'rotate(-2.5deg)', boxShadow: '5px 5px 0 #dc2626', border: '3px solid #111', textAlign: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: '#fff', letterSpacing: '0.2em', opacity: 0.85 }}>FAST PAYMENT</div>
            <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.05, marginTop: 2 }}>到着日振込！</div>
          </div>
          <div style={{ background: '#dc2626', color: '#fff', padding: '10px 18px', borderRadius: 10, transform: 'rotate(2.5deg)', boxShadow: '5px 5px 0 #111', border: '3px solid #111', textAlign: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: '#FCD34D', letterSpacing: '0.2em' }}>BULK OK</div>
            <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.05, marginTop: 2 }}>まとめ買取歓迎！</div>
          </div>
        </div>
      </header>

      {/* Red gradient line */}
      <div style={{ position: 'absolute', top: padY + headerH + 14, left: padX, right: padX, height: lineH, background: 'linear-gradient(90deg, #dc2626 0%, #f59e0b 50%, #dc2626 100%)', zIndex: 2 }} />

      {/* Single cards section */}
      {singles.length > 0 && (
        <SectionRenderer
          title="シングルカード" subtitle="SINGLE CARDS"
          items={singles} top={singleTop} height={singleSectionH}
          padX={padX} gridW={gridW} sectionTitleH={sectionTitleH} cardGap={10}
        />
      )}

      {/* Promo cards section */}
      {promos.length > 0 && (
        <SectionRenderer
          title="プロモカード" subtitle="PROMO CARDS"
          items={promos} top={promoTop} height={promoSectionH}
          padX={padX} gridW={gridW} sectionTitleH={sectionTitleH} cardGap={10}
        />
      )}

      {/* Footer */}
      <footer style={{
        position: 'absolute', bottom: padY, left: padX, right: padX, height: footerH,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 14, color: '#111', fontWeight: 600, zIndex: 2,
      }}>
        <span>※ 買取価格は状態・在庫状況により変動する場合がございます。</span>
        <span style={{ fontWeight: 900 }}>更新日：{updatedAt}</span>
      </footer>
    </div>
  )
})
SinglePromoCanvas.displayName = 'SinglePromoCanvas'

// --- Section renderer ---
function SectionRenderer({ title, subtitle, items, top, height, padX, gridW, sectionTitleH, cardGap }: {
  title: string; subtitle: string; items: ProductWithRelations[]
  top: number; height: number; padX: number; gridW: number; sectionTitleH: number; cardGap: number
}) {
  const cols = items.length
  const cardAreaTop = top + sectionTitleH + 4
  const cardAreaH = height - sectionTitleH - 4
  const cardW = Math.floor((gridW - cardGap * (cols - 1)) / cols)

  // Card inner sizes
  const cardPadV = 8
  const nameH = 36
  const priceH = 32
  const nameFontSize = 14
  const priceFontSize = 22
  const imgH = cardAreaH - cardPadV * 2 - nameH - priceH - 8

  return (
    <>
      {/* Section title bar */}
      <div style={{
        position: 'absolute', top, left: padX, width: gridW, height: sectionTitleH,
        display: 'flex', alignItems: 'center', gap: 10, zIndex: 2,
      }}>
        <div style={{
          background: '#111', color: '#FCD34D',
          padding: '6px 20px', fontSize: 26, fontWeight: 900,
          letterSpacing: '0.08em', border: '3px solid #111',
          borderRadius: 6, boxShadow: '4px 4px 0 #dc2626', whiteSpace: 'nowrap',
        }}>
          {title}
        </div>
        <div style={{ fontSize: 14, fontWeight: 900, color: '#78350f', letterSpacing: '0.3em' }}>{subtitle}</div>
        <div style={{ flex: 1, height: 3, background: 'repeating-linear-gradient(90deg, #111 0 8px, transparent 8px 16px)' }} />
        <div style={{
          fontSize: 16, fontWeight: 900, color: '#111',
          background: '#fff', border: '2px solid #111',
          padding: '3px 12px', borderRadius: 999,
        }}>
          {items.length}種
        </div>
      </div>

      {/* Cards */}
      {items.map((product, index) => {
        const x = padX + index * (cardW + cardGap)
        return (
          <div key={product.id} style={{
            position: 'absolute', left: x, top: cardAreaTop, width: cardW, height: cardAreaH,
            background: '#fff', border: '2px solid #111', borderRadius: 6,
            padding: `${cardPadV}px 6px 0`, display: 'flex', flexDirection: 'column',
            overflow: 'hidden', boxShadow: '3px 3px 0 #111', zIndex: 2,
            boxSizing: 'border-box',
          }}>
            {/* Card image (portrait 5:7) */}
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image_url} alt={product.name}
                style={{ width: '100%', height: imgH, objectFit: 'contain' }}
                crossOrigin="anonymous"
              />
            ) : (
              <div style={{
                width: '100%', height: imgH,
                background: 'rgba(0,0,0,0.05)', border: '1px dashed rgba(0,0,0,0.2)',
                borderRadius: 4,
              }} />
            )}
            {/* Name */}
            <div style={{
              fontSize: nameFontSize, fontWeight: 800, color: '#111', textAlign: 'center',
              lineHeight: 1.15, height: nameH, marginTop: 2,
              overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {product.name}
            </div>
            {/* Price */}
            <div style={{
              marginLeft: -6, marginRight: -6,
              background: product.price === 0 ? '#dc2626' : '#111',
              height: priceH, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: product.price === 0 ? '#fff' : '#FCD34D', fontSize: priceFontSize, fontWeight: 900, lineHeight: 1 }}>
                {product.price === 0 ? '応談' : `¥${product.price.toLocaleString('ja-JP')}`}
              </span>
            </div>
          </div>
        )
      })}
    </>
  )
}
