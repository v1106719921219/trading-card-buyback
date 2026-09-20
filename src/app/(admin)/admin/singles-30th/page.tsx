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

const SETTING_KEY = 'sns_30th_single_default_products'
const CATEGORY_ID = 'db02ec12-d529-453c-a749-53da99e05533'
const SUBCATEGORY_ID = 'ca8f802a-52f1-495a-ab49-158063b00d64'

type ProductWithRelations = Product & {
  category: Category | null
  subcategory: Subcategory | null
}

export default function Singles30thPage() {
  const [products, setProducts] = useState<ProductWithRelations[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [highPriceIds, setHighPriceIds] = useState<Set<string>>(new Set())
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
    const [productsResult, settingResult] = await Promise.all([
      supabase
        .from('products')
        .select('*, category:categories(*), subcategory:subcategories(*)')
        .eq('is_active', true)
        .eq('category_id', CATEGORY_ID)
        .eq('subcategory_id', SUBCATEGORY_ID)
        .order('sort_order'),
      supabase.from('app_settings').select('value').eq('key', SETTING_KEY).maybeSingle(),
    ])

    if (productsResult.error) {
      toast.error('商品の取得に失敗しました')
      setLoading(false)
      return
    }

    const s = (productsResult.data || []) as ProductWithRelations[]
    setProducts(s)

    if (settingResult.data?.value) {
      try {
        const saved: { singles: string[] } = JSON.parse(settingResult.data.value)
        setSelectedIds(new Set(saved.singles.filter((id) => s.some((x) => x.id === id))))
      } catch {
        setSelectedIds(new Set(s.map((x) => x.id)))
      }
    } else {
      setSelectedIds(new Set(s.map((x) => x.id)))
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchData() }, [fetchData])

  function toggleProduct(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleHighPrice(id: string) {
    setHighPriceIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function saveDefaults() {
    setSaving(true)
    const value = JSON.stringify({ singles: Array.from(selectedIds) })
    const tenantId = 'aaaaaaaa-0000-0000-0000-000000000001'
    const { data: existing } = await supabase.from('app_settings').select('key').eq('key', SETTING_KEY).maybeSingle()
    let error
    if (existing) {
      ({ error } = await supabase.from('app_settings').update({ value }).eq('key', SETTING_KEY))
    } else {
      ({ error } = await supabase.from('app_settings').insert({ key: SETTING_KEY, value, description: '30thシングル画像のデフォルト掲載商品', tenant_id: tenantId }))
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
      a.download = `30thシングル買取価格表_${new Date().toLocaleDateString('ja-JP').replace(/\//g, '')}.png`
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

  return (
    <div>
      <AdminHeader
        title="30thシングル買取一覧"
        description="30th CELEBRATION シングルカードの買取価格一覧と、X投稿用の価格画像を生成します（1920×1080）"
      />

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2 rounded-lg border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">
              チェックを変更したら「デフォルトとして保存」で次回以降も同じ選択が維持されます
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">計 {selectedIds.size} 件選択中</span>
              <Button variant="outline" size="sm" onClick={saveDefaults} disabled={saving} className="gap-1">
                <Save className="h-3.5 w-3.5" />
                デフォルトとして保存
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">30th CELEBRATION シングルカード</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{selectedIds.size} / {products.length} 件</span>
                  <Button variant="ghost" size="icon" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <p className="text-sm text-muted-foreground">読み込み中...</p> : (
                <div className="space-y-1.5 max-h-[65vh] overflow-y-auto pr-1">
                  {products.map((product) => (
                    <div key={product.id} className="flex items-center gap-3 rounded-md border px-3 py-2 hover:bg-muted transition-colors">
                      <Checkbox checked={selectedIds.has(product.id)} onCheckedChange={() => toggleProduct(product.id)} />
                      {product.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.image_url} alt="" className="w-8 h-8 object-cover rounded shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded border bg-muted flex items-center justify-center shrink-0"><ImageIcon className="h-4 w-4 text-muted-foreground/40" /></div>
                      )}
                      <span className="flex-1 text-sm truncate">{product.name}</span>
                      {product.market_price != null && (
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">相場 {product.market_price.toLocaleString('ja-JP')}円</span>
                      )}
                      <Badge variant="secondary" className="shrink-0 tabular-nums text-xs">{product.price.toLocaleString('ja-JP')}円</Badge>
                      <button
                        type="button"
                        onClick={() => toggleHighPrice(product.id)}
                        className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-bold ${highPriceIds.has(product.id) ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-400 border-gray-300'}`}
                      >高額</button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* プレビュー */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">プレビュー（1920×1080 / X推奨 16:9）</p>
            <Button onClick={handleDownload} disabled={downloading || selectedProducts.length === 0} className="gap-2">
              <Download className="h-4 w-4" />
              {downloading ? '生成中...' : 'PNG ダウンロード'}
            </Button>
          </div>
          <div className="border rounded-lg bg-muted/30" style={{ width: Math.ceil(1920 * 0.35), height: Math.ceil(1080 * 0.35), overflow: 'hidden', position: 'relative' }}>
            <div style={{ transform: 'scale(0.35)', transformOrigin: 'top left', width: '1920px', height: '1080px', position: 'absolute', top: 0, left: 0 }}>
              <Single30thCanvas ref={previewRef} products={selectedProducts} highPriceIds={highPriceIds} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Canvas (1920 × 1080) ---
const Single30thCanvas = React.forwardRef<HTMLDivElement, {
  products: ProductWithRelations[]
  highPriceIds: Set<string>
}>(({ products, highPriceIds }, ref) => {
  const today = new Date()
  const fmt = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  const updatedAt = fmt(today)

  const W = 1920
  const H = 1080
  const padX = 20
  const gap = 4

  // Header ends around y=310
  const gridTop = 310
  const footerH = 36

  const totalGridH = H - gridTop - footerH
  const gridW = W - padX * 2

  const cols = products.length > 32 ? 10 : 8
  const rows = Math.max(1, Math.ceil(products.length / cols))
  const cellH = Math.floor((totalGridH - gap * (rows - 1)) / rows)
  const cellW = Math.floor((gridW - gap * (cols - 1)) / cols)
  const priceH = 38
  const imgH = cellH - priceH
  const nameFontSize = 11
  const priceFontSize = 28

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
      {/* Background image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/single-promo-bg.png"
        alt=""
        style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, zIndex: 0 }}
        crossOrigin="anonymous"
      />

      {/* Section label */}
      <div style={{
        position: 'absolute', left: padX, top: gridTop - 28, zIndex: 3,
        background: '#dc2626', color: '#fff', padding: '2px 14px',
        fontSize: 14, fontWeight: 900, letterSpacing: '0.1em',
        borderRadius: 3, border: '2px solid #111', boxShadow: '2px 2px 0 #111',
      }}>
        30th CELEBRATION シングルカード <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em' }}>SINGLE CARDS</span>
      </div>

      {products.map((product, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const x = padX + col * (cellW + gap)
        const y = gridTop + row * (cellH + gap)
        const isHigh = highPriceIds.has(product.id)
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
              {/* Name overlay */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'rgba(0,0,0,0.6)', padding: '2px 3px',
                fontSize: nameFontSize, fontWeight: 900, color: '#fff', textAlign: 'center',
                lineHeight: 1.2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
              }}>
                {product.name}
              </div>
              {/* 高額買取 badge */}
              {isHigh && (
                <div style={{
                  position: 'absolute', top: 4, right: 4, width: 44, height: 44,
                  borderRadius: '50%', background: '#dc2626', border: '3px solid #fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 3, boxShadow: '1px 1px 4px rgba(0,0,0,0.3)',
                }}>
                  <span style={{ color: '#fff', fontSize: 10, fontWeight: 900, lineHeight: 1.1, textAlign: 'center' }}>高額<br />買取</span>
                </div>
              )}
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#111', height: priceH, borderRadius: '0 0 2px 2px',
            }}>
              <span style={{ color: '#FCD34D', fontSize: priceFontSize, fontWeight: 900, lineHeight: 1 }}>
                ¥{product.price.toLocaleString('ja-JP')}
              </span>
            </div>
          </div>
        )
      })}

      {/* Footer */}
      <footer style={{
        position: 'absolute', bottom: 4, left: padX, right: padX, height: footerH,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 13, color: '#111', fontWeight: 700, zIndex: 2,
      }}>
        <span>※ 買取価格は状態・在庫状況により変動する場合がございます。※ 美品の価格となります。キズ・白かけ等がある場合は減額となります。</span>
        <span style={{ fontWeight: 900, whiteSpace: 'nowrap', marginLeft: 20 }}>更新日：{updatedAt}</span>
      </footer>
    </div>
  )
})
Single30thCanvas.displayName = 'Single30thCanvas'
