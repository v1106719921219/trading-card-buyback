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
    const tenantId = 'aaaaaaaa-0000-0000-0000-000000000001'
    // Check if row exists
    const { data: existing } = await supabase.from('app_settings').select('key').eq('key', SETTING_KEY).maybeSingle()
    let error
    if (existing) {
      ({ error } = await supabase.from('app_settings').update({ value }).eq('key', SETTING_KEY))
    } else {
      ({ error } = await supabase.from('app_settings').insert({ key: SETTING_KEY, value, description: 'シングル・プロモ画像のデフォルト掲載商品', tenant_id: tenantId }))
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

// --- Canvas (1920 × 1080) — Background image template approach ---
const SinglePromoCanvas = React.forwardRef<HTMLDivElement, {
  singles: ProductWithRelations[]
  promos: ProductWithRelations[]
}>(({ singles, promos }, ref) => {
  const today = new Date()
  const fmt = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  const updatedAt = fmt(today)

  // Layout — matched to background image positions
  const W = 1920
  const H = 1080
  const padX = 30
  const headerH = 270  // Background image header area
  const footerH = 40
  const sectionTitleH = 44
  const sectionGap = 6
  const gridW = W - padX * 2

  const contentTop = headerH
  const contentBottom = H - footerH
  const totalContentH = contentBottom - contentTop
  const singleSectionH = Math.floor((totalContentH - sectionGap) / 2)
  const promoSectionH = totalContentH - sectionGap - singleSectionH

  const singleTop = contentTop
  const promoTop = contentTop + singleSectionH + sectionGap

  return (
    <div
      ref={ref}
      style={{
        width: W, height: H,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: '"Noto Sans JP", sans-serif',
        boxSizing: 'border-box',
      }}
    >
      {/* Background template image — provides all decorative effects */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/single-promo-bg.jpg"
        alt=""
        style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, objectFit: 'cover', zIndex: 0 }}
        crossOrigin="anonymous"
      />

      {/* Dynamic content overlaid on top */}

      {/* Single cards section */}
      {singles.length > 0 && (
        <SectionRenderer
          title="シングルカード" subtitle="SINGLE CARDS"
          items={singles} top={singleTop} height={singleSectionH}
          padX={padX} gridW={gridW} sectionTitleH={sectionTitleH} cardGap={8}
        />
      )}

      {/* Promo cards section */}
      {promos.length > 0 && (
        <SectionRenderer
          title="プロモカード" subtitle="PROMO CARDS"
          items={promos} top={promoTop} height={promoSectionH}
          padX={padX} gridW={gridW} sectionTitleH={sectionTitleH} cardGap={8}
        />
      )}

      {/* Footer — overlaid on background */}
      <footer style={{
        position: 'absolute', bottom: 8, left: padX, right: padX, height: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 14, color: '#333', fontWeight: 700, zIndex: 2,
      }}>
        <span>※ 買取価格は状態・在庫状況により変動する場合がございます。※ 美品の価格となります。キズ・白かけ等がある場合は減額となります。</span>
        <span style={{ fontWeight: 900, whiteSpace: 'nowrap', marginLeft: 20 }}>更新日：{updatedAt}</span>
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
  const cols = items.length || 1
  const cardAreaTop = top + sectionTitleH + 4
  const cardAreaH = height - sectionTitleH - 4
  const cardW = Math.floor((gridW - cardGap * (cols - 1)) / cols)

  const nameH = 40
  const priceH = 42
  const cardPadV = 6
  const nameFontSize = cols > 8 ? 12 : 15
  const priceFontSize = cols > 8 ? 22 : 28
  const imgH = cardAreaH - cardPadV * 2 - nameH - priceH - 6

  return (
    <>
      {/* Section title bar */}
      <div style={{
        position: 'absolute', top, left: padX, width: gridW, height: sectionTitleH,
        background: '#111', borderRadius: 6,
        display: 'flex', alignItems: 'center', gap: 10, zIndex: 2,
        padding: '0 16px',
        boxSizing: 'border-box',
      }}>
        <div style={{
          color: '#FCD34D', fontSize: 28, fontWeight: 900,
          letterSpacing: '0.08em', whiteSpace: 'nowrap',
        }}>
          {title}
        </div>
        <div style={{ fontSize: 16, fontWeight: 900, color: '#999', letterSpacing: '0.25em' }}>{subtitle}</div>
        <div style={{ flex: 1, height: 0, borderTop: '2px dotted rgba(255,255,255,0.25)' }} />
        <div style={{
          fontSize: 17, fontWeight: 900, color: '#111',
          background: '#FCD34D', border: '2px solid #FCD34D',
          padding: '2px 14px', borderRadius: 999, whiteSpace: 'nowrap',
        }}>
          全{items.length}種
        </div>
      </div>

      {/* Cards */}
      {items.map((product, index) => {
        const x = padX + index * (cardW + cardGap)
        const isHighPrice = product.price >= 10000
        return (
          <div key={product.id} style={{
            position: 'absolute', left: x, top: cardAreaTop, width: cardW, height: cardAreaH,
            background: '#fff', border: '2px solid #111', borderRadius: 8,
            padding: `${cardPadV}px 6px 0`, display: 'flex', flexDirection: 'column',
            overflow: 'hidden', boxShadow: '2px 2px 0 rgba(0,0,0,0.15)', zIndex: 2,
            boxSizing: 'border-box',
          }}>
            {/* 高額買取 badge */}
            {isHighPrice && (
              <div style={{
                position: 'absolute', top: 6, right: 6,
                width: 52, height: 52, borderRadius: '50%',
                background: '#dc2626', border: '3px solid #fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', zIndex: 3,
                boxShadow: '1px 1px 4px rgba(0,0,0,0.3)',
              }}>
                <span style={{ color: '#fff', fontSize: 9, fontWeight: 900, lineHeight: 1.1, textAlign: 'center' }}>高額<br />買取</span>
              </div>
            )}
            {/* Card image */}
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
                background: 'rgba(0,0,0,0.04)', border: '1px dashed rgba(0,0,0,0.15)',
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
            {/* Price bar */}
            <div style={{
              marginLeft: -6, marginRight: -6,
              background: product.price === 0 ? '#dc2626' : '#111',
              height: priceH, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '0 0 6px 6px',
            }}>
              <span style={{
                color: product.price === 0 ? '#fff' : '#FCD34D',
                fontSize: priceFontSize, fontWeight: 900, lineHeight: 1,
              }}>
                {product.price === 0 ? '応談' : `¥${product.price.toLocaleString('ja-JP')}`}
              </span>
            </div>
          </div>
        )
      })}
    </>
  )
}
