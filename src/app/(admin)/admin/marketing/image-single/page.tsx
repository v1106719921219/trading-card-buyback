'use client'

import { BULK_SINGLE_IDS, isBulkSingle } from '@/lib/single-product-groups'
import { SINGLE_CARD_RARITIES, UNKNOWN_RARITY, singleCardRarity } from '@/lib/single-card-rarity'
import { CardImage } from '@/components/admin/card-image'
import { promoImageFrame } from '@/lib/promo-image-framing'

import { useEffect, useRef, useState, useCallback } from 'react'
import React from 'react'
import { ImagePostText } from '@/components/admin/image-post-text'
import { imagePublicationSelection } from '@/lib/image-publication'
import { ImagePublicationControl } from '@/components/admin/image-publication-control'
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
const RARITY_PAGE_SIZE = 24
const PROMO_PAGE_SIZE = 10

type ProductWithRelations = Product & {
  category: Category | null
  subcategory: Subcategory | null
}

type ImagePage = {
  key: string
  label: string
  singles: ProductWithRelations[]
  promos: ProductWithRelations[]
}

function rarityImagePages(singles: ProductWithRelations[], promos: ProductWithRelations[]): ImagePage[] {
  const groups = new Map<string, ProductWithRelations[]>()
  for (const product of singles) {
    const rarity = singleCardRarity(product.name)
    const name = product.name.normalize('NFKC')
    const combined = isBulkSingle(product) ? name.match(/^[A-Z]+(?:\s*\/\s*[A-Z]+)+(?=\s|$)/)?.[0] : undefined
    const grade = name.match(/\bPSA\s*(\d+)\b/i)?.[1]
    const base = combined ?? (rarity === UNKNOWN_RARITY ? (isBulkSingle(product) ? 'その他の最低保証' : 'レアリティ未設定') : rarity)
    const label = grade ? `${base} PSA${grade}` : base
    const products = groups.get(label) ?? []
    products.push(product)
    groups.set(label, products)
  }
  const labels = [...SINGLE_CARD_RARITIES, ...Array.from(groups.keys()).filter(label => !SINGLE_CARD_RARITIES.some(rarity => rarity === label))]
  const pages: ImagePage[] = []
  for (const label of [...labels, 'プロモカード']) {
    const products = label === 'プロモカード' ? promos : groups.get(label) ?? []
    const count = Math.ceil(products.length / RARITY_PAGE_SIZE)
    for (let index = 0; index < count; index++) {
      const items = products.slice(index * RARITY_PAGE_SIZE, (index + 1) * RARITY_PAGE_SIZE)
      pages.push({
        key: `${label}-${index}`,
        label: count > 1 ? `${label}（${index + 1}/${count}）` : label,
        singles: label === 'プロモカード' ? [] : items,
        promos: label === 'プロモカード' ? items : [],
      })
    }
  }
  return pages
}

export default function SinglePromoImagePage() {
  const [group, setGroup] = useState('promo-bulk')
  useEffect(() => {
    const requestedGroup = new URLSearchParams(window.location.search).get('group')
    if (requestedGroup === 'bulk' || requestedGroup === 'promo') setGroup(requestedGroup)
  }, [])
  const promoOnly = group === 'promo'
  const [allSingles, setSingles] = useState<ProductWithRelations[]>([])
  const [allPromos, setPromos] = useState<ProductWithRelations[]>([])
  const [manualSingleIds, setSelectedSingleIds] = useState<Set<string>>(new Set())
  const [manualPromoIds, setSelectedPromoIds] = useState<Set<string>>(new Set())
  const [highPriceIds, setHighPriceIds] = useState<Set<string>>(new Set())
  const [publishedOnly, setPublishedOnly] = useState(true)
  const { products: singles, selectedIds: selectedSingleIds } = imagePublicationSelection(allSingles, manualSingleIds, publishedOnly)
  const { products: promos, selectedIds: selectedPromoIds } = imagePublicationSelection(allPromos, manualPromoIds, publishedOnly)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [byRarity, setByRarity] = useState(false)
  const [splitPromos, setSplitPromos] = useState(false)
  const [imagePageKey, setImagePageKey] = useState('')
  const previewRef = useRef<HTMLDivElement>(null)
  const previewViewportRef = useRef<HTMLDivElement>(null)
  const [previewWidth, setPreviewWidth] = useState(0)
  const [previewZoomed, setPreviewZoomed] = useState(false)

  useEffect(() => {
    const viewport = previewViewportRef.current
    if (!viewport) return
    const measure = () => setPreviewWidth(viewport.clientWidth)
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    measure()
    return () => observer.disconnect()
  }, [])
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
    if (publishedOnly) return
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
    if (publishedOnly) return
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
      const options = { includeQueryParams: true, quality: 1, pixelRatio: 2 }
      await toPng(previewRef.current, options)
      const dataUrl = await toPng(previewRef.current, options)

      const a = document.createElement('a')
      a.href = dataUrl
      const suffix = imagePage ? `_${imagePage.label.replaceAll('/', '-')}` : ''
      a.download = `${promoOnly ? "プロモ買取価格表" : "シングルプロモ買取価格表"}${suffix}_${new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }).replace(/\//g, '')}.png`
      a.click()
      toast.success('画像をダウンロードしました')
    } catch (e) {
      console.error(e)
      toast.error('画像の生成に失敗しました')
    } finally {
      setDownloading(false)
    }
  }

  const groupSingles = promoOnly ? [] : singles.filter(p => group === 'all' || (group === 'bulk' || group === 'promo-bulk' ? isBulkSingle(p) : !isBulkSingle(p)))
  const selectedSingles = groupSingles.filter((p) => p.price > 0 && selectedSingleIds.has(p.id))
  const selectedPromos = group === 'bulk' ? [] : promos
    .filter((p) => p.price > 0 && selectedPromoIds.has(p.id))
    .sort((a, b) => b.price - a.price)
  const totalSelected = selectedSingles.length + selectedPromos.length
  const promoPageCount = Math.ceil(selectedPromos.length / PROMO_PAGE_SIZE)
  const pages: ImagePage[] = promoOnly
    ? Array.from({ length: splitPromos ? promoPageCount : 0 }, (_, index) => ({
        key: `promo-only-${index}`,
        label: `プロモカード（${index + 1}/${promoPageCount}）`,
        singles: [],
        promos: selectedPromos.slice(index * PROMO_PAGE_SIZE, (index + 1) * PROMO_PAGE_SIZE),
      }))
    : byRarity ? rarityImagePages(selectedSingles, selectedPromos) : []
  const imagePage = pages.find(page => page.key === imagePageKey) ?? pages[0]
  const previewSingles = imagePage?.singles ?? selectedSingles
  const previewPromos = imagePage?.promos ?? selectedPromos
  const tallPromoSheet = promoOnly && !splitPromos && previewPromos.length > PROMO_PAGE_SIZE
  const canvasWidth = tallPromoSheet ? 1440 : 1920
  const promoColumns = tallPromoSheet ? Math.max(5, Math.ceil(Math.sqrt(previewPromos.length / 2))) : 5
  const canvasHeight = tallPromoSheet ? 200 + Math.ceil(previewPromos.length / promoColumns) * 330 : 1080
  const fitScale = previewWidth > 0 ? Math.min(1, previewWidth / canvasWidth) : 0.35
  const previewScale = promoOnly && previewZoomed ? 1 : fitScale

  return (
    <div>
      <AdminHeader
        title="シングル・プロモ・最低保証 画像・投稿文生成"
        description="選んだシングル・プロモ・最低保証をまとめて買取画像にします（1920×1080）"
      />

      <ImagePublicationControl linked={publishedOnly} onChange={setPublishedOnly} count={totalSelected} loading={loading} refresh={() => void fetchData()} />

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
            {([['promo', 'プロモのみ'], ['promo-bulk', 'プロモ＋最低保証'], ['all', 'すべて'], ['bulk', 'まとめ買取・最低保証'], ['individual', '個別カード・プロモ']] as const).map(([value, label]) => <Button key={value} variant={group === value ? 'default' : 'outline'} disabled={downloading} onClick={() => { setGroup(value); setImagePageKey('') }}>{label}</Button>)}
            <Button variant="outline" asChild><a href="/admin/products">商品管理で価格・画像を編集</a></Button>
          </div>
          <p className="text-sm text-muted-foreground">商品管理の価格・画像を使用します。変更後は更新ボタンで読み直してください。0円の商品は画像・投稿文に掲載されません。</p>
          {/* シングルカード選択 */}
          {!promoOnly && <Card>
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
                      <Checkbox disabled={publishedOnly || product.price <= 0} checked={product.price > 0 && selectedSingleIds.has(product.id)} onCheckedChange={() => toggleSingle(product.id)} />
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
                      <Checkbox disabled={publishedOnly || product.price <= 0} checked={product.price > 0 && selectedPromoIds.has(product.id)} onCheckedChange={() => togglePromo(product.id)} />
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
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">プレビュー（{canvasWidth}×{canvasHeight}）</p>
            <Button onClick={handleDownload} disabled={loading || downloading || totalSelected === 0} className="gap-2">
              <Download className="h-4 w-4" />
              {downloading ? '生成中...' : 'PNG ダウンロード'}
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {promoOnly && (
              <Button variant="outline" aria-pressed={previewZoomed} onClick={() => setPreviewZoomed(zoomed => !zoomed)}>
                {previewZoomed ? '全体を表示' : '拡大して確認'}
              </Button>
            )}
            {promoOnly && <label className="grid gap-1 text-sm">
              画像の分け方
              <select className="rounded-md border bg-background px-3 py-2" value={splitPromos ? 'split' : 'combined'} onChange={e => { setSplitPromos(e.target.value === 'split'); setImagePageKey('') }} disabled={downloading}>
                <option value="combined">1枚にまとめる</option>
                <option value="split">10商品ずつ分ける</option>
              </select>
            </label>}
            {!promoOnly && <label className="grid gap-1 text-sm">
              画像の分け方
              <select className="rounded-md border bg-background px-3 py-2" value={byRarity ? 'rarity' : 'combined'} onChange={e => setByRarity(e.target.value === 'rarity')} disabled={downloading}>
                <option value="combined">1枚にまとめる</option>
                <option value="rarity">レアリティ別</option>
              </select>
            </label>}
            {(promoOnly ? splitPromos : byRarity) && (
              <label className="grid gap-1 text-sm">
                表示する画像
                <select className="rounded-md border bg-background px-3 py-2" value={imagePage?.key ?? ''} onChange={e => setImagePageKey(e.target.value)} disabled={downloading || pages.length === 0}>
                  {pages.length === 0 && <option value="">対象商品なし</option>}
                  {pages.map(page => <option key={page.key} value={page.key}>{page.label}（{page.singles.length + page.promos.length}件）</option>)}
                </select>
              </label>
            )}
          </div>
          <div ref={previewViewportRef} className="w-full overflow-auto rounded-lg border bg-muted/30"
            style={{ maxHeight: promoOnly && previewZoomed ? '75vh' : undefined }}>
            <div style={{ position: 'relative', width: Math.floor(canvasWidth * previewScale), height: Math.ceil(canvasHeight * previewScale), overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
                <SinglePromoCanvas ref={previewRef} singles={previewSingles} promos={previewPromos}
                  highPriceIds={highPriceIds} sectionLabel={imagePage?.label} promoOnly={promoOnly}
                  width={canvasWidth} height={canvasHeight} promoColumns={promoColumns} />
              </div>
            </div>
          </div>
          <ImagePostText key={promoOnly ? 'promo' : 'standard'} products={[...previewSingles, ...previewPromos]} heading={promoOnly ? '🃏ポケモンカード プロモ買取強化中🃏' : group === 'promo-bulk' ? '🃏ポケモンカード プロモ・最低保証 買取強化中🃏' : '🃏ポケモンカード シングル＆プロモ 高価買取中🃏'} />
        </div>
      </div>
    </div>
  )
}

// Export canvas
const SinglePromoCanvas = React.forwardRef<HTMLDivElement, {
  singles: ProductWithRelations[]
  promos: ProductWithRelations[]
  highPriceIds: Set<string>
  sectionLabel?: string
  promoOnly: boolean
  width: number
  height: number
  promoColumns: number
}>(({ singles, promos, highPriceIds, sectionLabel, promoOnly, width: W, height: H, promoColumns }, ref) => {
  const updatedAt = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '.')
  const products = [...singles, ...promos]
  const padX = 20
  const gap = promoOnly ? 12 : 4
  const gridTop = promoOnly ? 155 : 310
  const footerH = 36
  const gridW = W - padX * 2
  const rows = promoOnly ? Math.max(2, Math.ceil(products.length / promoColumns)) : Math.max(1, Math.ceil(products.length / 8))
  const cols = promoOnly ? promoColumns : Math.max(1, Math.ceil(products.length / rows))
  const cellW = Math.floor((gridW - gap * (cols - 1)) / cols)
  const cellH = Math.floor((H - gridTop - footerH - gap * (rows - 1)) / rows)
  const priceH = promoOnly ? Math.min(48, Math.max(1, Math.floor(cellH * 0.17))) : Math.min(48, Math.max(30, Math.floor(cellH * 0.15)))
  const imgH = cellH - priceH
  const nameH = promoOnly ? 82 : 18
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
        background: promoOnly ? '#fff7eb' : undefined,
      }}
    >
      {/* Background image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {promoOnly ? (
        <header style={{ display: 'flex', alignItems: 'center', gap: 24, margin: '12px 20px', height: 112, borderBottom: '4px solid #ea630c', color: '#201913' }}>
          <img src="/assets/logo-full.png" alt="買取スクエア" style={{ width: 94, height: 94, objectFit: 'contain' }} />
          <span style={{ fontSize: 50, fontWeight: 900 }}>ポケモンカード プロモ買取価格表</span>
          <span style={{ marginLeft: 'auto', fontSize: 25, fontWeight: 800 }}>{sectionLabel ?? (products.length > 0 ? `${products.length}商品` : '')}</span>
        </header>
      ) : <img
        src="/assets/single-promo-bg.png"
        alt=""
        style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, zIndex: 0 }}
        crossOrigin="anonymous"
      />}

      {!promoOnly && products.length > 0 && <div style={{
        position: 'absolute', left: padX, top: gridTop - 28, zIndex: 3,
        background: '#dc2626', color: '#fff', padding: '2px 14px',
        fontSize: 14, fontWeight: 900, letterSpacing: '0.1em',
        borderRadius: 3, border: '2px solid #111', boxShadow: '2px 2px 0 #111',
      }}>{sectionLabel ?? label}</div>}

      {/* Singles */}
      {products.map((product, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const rowSize = Math.min(cols, products.length - row * cols)
        const rowInset = promoOnly ? (cols - rowSize) * (cellW + gap) / 2 : 0
        const x = padX + rowInset + col * (cellW + gap)
        const y = gridTop + row * (cellH + gap)
        const isHigh = highPriceIds.has(product.id)
        // Leave space for three lines and size conservatively for full-width characters.
        const nameLength = [...product.name].length
        const nameFontSize = promoOnly
          ? Math.min(22, Math.floor((cellW - 24) / Math.max(1, Math.ceil(nameLength / 3))))
          : 11
        return (
          <div key={product.id} data-product-id={product.id} style={{
            position: 'absolute', left: x, top: y, width: cellW, height: cellH,
            background: '#fff', border: '1.5px solid #111', borderRadius: 3,
            overflow: 'hidden', boxShadow: '1px 1px 0 #111', zIndex: 2,
            boxSizing: 'border-box',
          }}>
            <div style={{ position: 'relative', width: '100%', height: imgH }}>
              {product.image_url ? (
                <div style={{ width: '100%', height: `calc(100% - ${nameH}px)`, padding: 4, boxSizing: 'border-box', background: '#fff' }}>
                  <CardImage src={product.image_url} alt={product.name} frame={promoImageFrame(product)} />
                </div>
              ) : (
                <div style={{ width: '100%', height: '100%', background: 'rgba(0,0,0,0.04)' }} />
              )}
              {/* Name overlay */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: promoOnly ? '#fff' : 'rgba(0,0,0,0.6)', padding: promoOnly ? '5px 8px' : '2px 3px',
                height: promoOnly ? nameH : undefined, alignContent: promoOnly ? 'center' : undefined,
                fontSize: nameFontSize, fontWeight: 900, color: promoOnly ? '#201913' : '#fff', textAlign: 'center',
                lineHeight: promoOnly ? 1.08 : 1.2, overflow: 'hidden',
                whiteSpace: promoOnly ? 'normal' : 'nowrap', overflowWrap: promoOnly ? 'anywhere' : undefined,
                textOverflow: 'ellipsis',
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
