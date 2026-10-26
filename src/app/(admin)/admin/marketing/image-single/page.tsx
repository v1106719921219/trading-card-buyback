'use client'

import { BULK_SINGLE_IDS, isBulkSingle } from '@/lib/single-product-groups'
import { CardImage } from '@/components/admin/card-image'
import { promoImageFrame } from '@/lib/promo-image-framing'

import { useEffect, useRef, useState, useCallback } from 'react'
import React from 'react'
import { ImagePostText } from '@/components/admin/image-post-text'
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
  const [group, setGroup] = useState('promo-bulk')
  useEffect(() => { if (new URLSearchParams(window.location.search).get('group') === 'bulk') setGroup('bulk') }, [])
  const [singles, setSingles] = useState<ProductWithRelations[]>([])
  const [promos, setPromos] = useState<ProductWithRelations[]>([])
  const [selectedSingleIds, setSelectedSingleIds] = useState<Set<string>>(new Set())
  const [selectedPromoIds, setSelectedPromoIds] = useState<Set<string>>(new Set())
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
    const [singlesResult, promosResult, settingResult] = await Promise.all([
      supabase
        .from('products')
        .select('*, category:categories(*), subcategory:subcategories(*)')
        .eq('is_active', true)
        .eq('category_id', CATEGORY_ID)
        .or(`subcategory_id.eq.${SINGLE_SUBCATEGORY_ID},id.in.(${BULK_SINGLE_IDS.join(',')})`)
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

  function toggleHighPrice(id: string) {
    setHighPriceIds((prev) => {
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
      a.download = `シングルプロモ買取価格表_${new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }).replace(/\//g, '')}.png`
      a.click()
      toast.success('画像をダウンロードしました')
    } catch (e) {
      console.error(e)
      toast.error('画像の生成に失敗しました')
    } finally {
      setDownloading(false)
    }
  }

  const groupSingles = singles.filter(p => group === 'all' || (group === 'bulk' || group === 'promo-bulk' ? isBulkSingle(p) : !isBulkSingle(p)))
  const selectedSingles = groupSingles.filter((p) => p.price > 0 && selectedSingleIds.has(p.id))
  const selectedPromos = group === 'bulk' ? [] : promos.filter((p) => p.price > 0 && selectedPromoIds.has(p.id))
  const totalSelected = selectedSingles.length + selectedPromos.length

  return (
    <div>
      <AdminHeader
        title="シングル・プロモ・最低保証 画像・投稿文生成"
        description="選んだシングル・プロモ・最低保証をまとめて買取画像にします（1920×1080）"
      />

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2 rounded-lg border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">
              チェックを変更したら「デフォルトとして保存」で次回以降も同じ選択が維持されます
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">計 {totalSelected} 件選択中</span>
              <Button variant="outline" size="sm" onClick={saveDefaults} disabled={saving} className="gap-1">
                <Save className="h-3.5 w-3.5" />
                デフォルトとして保存
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {([['promo-bulk', 'プロモ＋最低保証'], ['all', 'すべて'], ['bulk', 'まとめ買取・最低保証'], ['individual', '個別カード・プロモ']] as const).map(([value, label]) => <Button key={value} variant={group === value ? 'default' : 'outline'} onClick={() => setGroup(value)}>{label}</Button>)}
            <Button variant="outline" asChild><a href="/admin/products">商品管理で価格・画像を編集</a></Button>
          </div>
          <p className="text-sm text-muted-foreground">商品管理の価格・画像を使用します。変更後は更新ボタンで読み直してください。0円の商品は画像・投稿文に掲載されません。</p>
          {/* シングルカード選択 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">{group === 'bulk' || group === 'promo-bulk' ? 'まとめ買取・最低保証' : 'シングルカード'}</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{selectedSingles.length} 件</span>
                  <Button variant="ghost" size="icon" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <p className="text-sm text-muted-foreground">読み込み中...</p> : (
                <div className="space-y-1.5 max-h-[30vh] overflow-y-auto pr-1">
                  {groupSingles.map((product) => (
                    <div key={product.id} className="flex items-center gap-3 rounded-md border px-3 py-2 hover:bg-muted transition-colors">
                      <Checkbox disabled={product.price <= 0} checked={product.price > 0 && selectedSingleIds.has(product.id)} onCheckedChange={() => toggleSingle(product.id)} />
                      {product.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.image_url} alt="" className="w-8 h-8 object-cover rounded shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded border bg-muted flex items-center justify-center shrink-0"><ImageIcon className="h-4 w-4 text-muted-foreground/40" /></div>
                      )}
                      <span className="flex-1 text-sm truncate">{product.name}</span>
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

          {/* プロモカード選択 */}
          {group !== 'bulk' && <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">プロモカード</CardTitle>
                <span className="text-sm text-muted-foreground">{selectedPromos.length} 件</span>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <p className="text-sm text-muted-foreground">読み込み中...</p> : (
                <div className="space-y-1.5 max-h-[30vh] overflow-y-auto pr-1">
                  {promos.map((product) => (
                    <div key={product.id} className="flex items-center gap-3 rounded-md border px-3 py-2 hover:bg-muted transition-colors">
                      <Checkbox disabled={product.price <= 0} checked={product.price > 0 && selectedPromoIds.has(product.id)} onCheckedChange={() => togglePromo(product.id)} />
                      {product.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.image_url} alt="" className="w-8 h-8 object-cover rounded shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded border bg-muted flex items-center justify-center shrink-0"><ImageIcon className="h-4 w-4 text-muted-foreground/40" /></div>
                      )}
                      <span className="flex-1 text-sm truncate">{product.name}</span>
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
          </Card>}

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
              <SinglePromoCanvas ref={previewRef} singles={selectedSingles} promos={selectedPromos} highPriceIds={highPriceIds} />
            </div>
          </div>
          <ImagePostText products={[...selectedSingles, ...selectedPromos]} heading={group === 'promo-bulk' ? '🃏ポケモンカード プロモ・最低保証 買取強化中🃏' : '🃏ポケモンカード シングル＆プロモ 高価買取中🃏'} />
        </div>
      </div>
    </div>
  )
}

// --- Canvas (1920 × 1080) ---
const SinglePromoCanvas = React.forwardRef<HTMLDivElement, {
  singles: ProductWithRelations[]
  promos: ProductWithRelations[]
  highPriceIds: Set<string>
}>(({ singles, promos, highPriceIds }, ref) => {
  const updatedAt = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '.')
  const products = [...singles, ...promos]
  const W = 1920
  const H = 1080
  const padX = 20
  const gap = 4
  const gridTop = 310
  const footerH = 36
  const gridW = W - padX * 2
  const rows = Math.max(1, Math.ceil(products.length / 8))
  const cols = Math.max(1, Math.ceil(products.length / rows))
  const cellW = Math.floor((gridW - gap * (cols - 1)) / cols)
  const cellH = Math.floor((H - gridTop - footerH - gap * (rows - 1)) / rows)
  const priceH = Math.min(48, Math.max(30, Math.floor(cellH * 0.15)))
  const imgH = cellH - priceH
  const nameFontSize = 11
  const priceFontSize = Math.min(36, priceH - 6)
  const hasBulk = singles.some(isBulkSingle)
  const label = hasBulk && promos.length ? 'プロモカード・最低保証' : hasBulk ? 'まとめ買取・最低保証' : singles.length && promos.length ? 'シングルカード・プロモ' : promos.length ? 'プロモカード' : 'シングルカード'

  return (
    <div
      ref={ref}
      data-testid="single-promo-canvas"
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

      {products.length > 0 && <div style={{
        position: 'absolute', left: padX, top: gridTop - 28, zIndex: 3,
        background: '#dc2626', color: '#fff', padding: '2px 14px',
        fontSize: 14, fontWeight: 900, letterSpacing: '0.1em',
        borderRadius: 3, border: '2px solid #111', boxShadow: '2px 2px 0 #111',
      }}>{label}</div>}

      {/* Singles */}
      {products.map((product, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const x = padX + col * (cellW + gap)
        const y = gridTop + row * (cellH + gap)
        const isHigh = highPriceIds.has(product.id)
        return (
          <div key={product.id} data-product-id={product.id} style={{
            position: 'absolute', left: x, top: y, width: cellW, height: cellH,
            background: '#fff', border: '1.5px solid #111', borderRadius: 3,
            overflow: 'hidden', boxShadow: '1px 1px 0 #111', zIndex: 2,
            boxSizing: 'border-box',
          }}>
            <div style={{ position: 'relative', width: '100%', height: imgH }}>
              {product.image_url ? (
                <div style={{ width: '100%', height: 'calc(100% - 18px)', padding: 4, boxSizing: 'border-box', background: '#fff' }}>
                  <CardImage src={product.image_url} alt={product.name} frame={promoImageFrame(product)} />
                </div>
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
SinglePromoCanvas.displayName = 'SinglePromoCanvas'
