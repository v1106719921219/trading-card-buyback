'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
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
// model_numberのカード番号でセクション判定。103以下はミラーピカチュウ(017〜046・コンプセット含む)、104以降は高レア(AR/SAR等)
// ※sort_orderは商品管理の並び順（価格の高い順）に使うためセクション判定には使わない
const HIGH_RARE_MIN_NUM = 104
function cardNum(p: Product): number {
  const m = p.model_number?.match(/M6a (\d+)/)
  return m ? Number(m[1]) : 999
}
// コンプセット商品はピカチュウセクションの末尾に置く
function p2comp(p: Product): number {
  return p.model_number?.includes('コンプ') || p.name.includes('コンプ') ? 1 : 0
}

type ProductWithRelations = Product & {
  category: Category | null
  subcategory: Subcategory | null
}

type PageJob = {
  key: string
  sectionLabel: string
  sectionLabelEn: string
  fileLabel: string
  pageNo: number
  pageCount: number
  cols: number
  products: ProductWithRelations[]
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export default function Singles30thPage() {
  const [products, setProducts] = useState<ProductWithRelations[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [highPriceIds, setHighPriceIds] = useState<Set<string>>(new Set())
  const [pageSize, setPageSize] = useState(24)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [saving, setSaving] = useState(false)
  const pageRefs = useRef<Record<string, HTMLDivElement | null>>({})
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

  // 高レアはスニダン相場の高い順（相場未取得は末尾・同額はカード番号順）
  const rares = useMemo(() =>
    products
      .filter((p) => cardNum(p) >= HIGH_RARE_MIN_NUM)
      .sort((a, b) => (b.market_price ?? -1) - (a.market_price ?? -1) || cardNum(a) - cardNum(b)),
  [products])
  // ミラーピカチュウはカード番号順、コンプセットは末尾
  const pikachus = useMemo(() =>
    products
      .filter((p) => cardNum(p) < HIGH_RARE_MIN_NUM)
      .sort((a, b) => {
        const compA = p2comp(a); const compB = p2comp(b)
        return compA - compB || cardNum(a) - cardNum(b)
      }),
  [products])

  function toggleProduct(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSection(items: ProductWithRelations[], selectAll: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const p of items) {
        if (selectAll) next.add(p.id); else next.delete(p.id)
      }
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

  // セクションごとの画像ジョブ一覧。高レアはページ分割、ミラーピカチュウは常に1枚（6列×5行）に全収載
  const pageJobs = useMemo<PageJob[]>(() => {
    const jobs: PageJob[] = []
    const sections = [
      { label: '高レアカード', labelEn: 'HIGH RARE CARDS', file: '高レア', cols: 8, split: true, items: rares.filter((p) => selectedIds.has(p.id)) },
      { label: 'ミラーピカチュウ', labelEn: 'PIKACHU MIRROR', file: 'ピカチュウ', cols: 0, split: false, items: pikachus.filter((p) => selectedIds.has(p.id)) },
    ]
    for (const sec of sections) {
      // cols=0 は「1枚に全収載」: 5行に収まる列数を自動計算（最低6列）
      const cols = sec.cols || Math.max(6, Math.ceil(sec.items.length / 5))
      const pages = sec.split ? chunk(sec.items, pageSize) : (sec.items.length > 0 ? [sec.items] : [])
      pages.forEach((items, i) => {
        jobs.push({
          key: `${sec.file}-${i}`,
          sectionLabel: sec.label,
          sectionLabelEn: sec.labelEn,
          fileLabel: sec.file,
          pageNo: i + 1,
          pageCount: pages.length,
          cols,
          products: items,
        })
      })
    }
    return jobs
  }, [rares, pikachus, selectedIds, pageSize])

  async function downloadPages(jobs: PageJob[]) {
    setDownloading(true)
    try {
      await document.fonts.load('700 16px "Noto Sans JP"')
      await document.fonts.load('800 16px "Noto Sans JP"')
      await document.fonts.load('900 16px "Noto Sans JP"')
      await document.fonts.ready

      const { toPng } = await import('html-to-image')
      const options = { quality: 1, pixelRatio: 2 }
      const date = new Date().toLocaleDateString('ja-JP').replace(/\//g, '')
      for (const job of jobs) {
        const node = pageRefs.current[job.key]
        if (!node) continue
        await toPng(node, options)
        const dataUrl = await toPng(node, options)
        const a = document.createElement('a')
        a.href = dataUrl
        const suffix = job.pageCount > 1 ? `_${job.pageNo}` : ''
        a.download = `30thシングル買取価格表_${job.fileLabel}${suffix}_${date}.png`
        a.click()
        // 連続ダウンロードのブラウザ制限を避ける
        await new Promise((r) => setTimeout(r, 400))
      }
      toast.success(`${jobs.length}枚の画像をダウンロードしました`)
    } catch (e) {
      console.error(e)
      toast.error('画像の生成に失敗しました')
    } finally {
      setDownloading(false)
    }
  }

  const sectionCards = [
    { title: '高レアカード（AR / SAR / ex）', items: rares },
    { title: 'ミラーピカチュウ（017〜046）', items: pikachus },
  ]

  return (
    <div>
      <AdminHeader
        title="30thシングル買取一覧"
        description="30th CELEBRATION シングルカードの買取価格一覧と、X投稿用の価格画像を生成します（1920×1080・ページ自動分割）"
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

          {sectionCards.map((section) => {
            const selectedCount = section.items.filter((p) => selectedIds.has(p.id)).length
            const allSelected = section.items.length > 0 && selectedCount === section.items.length
            return (
              <Card key={section.title}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-base">{section.title}</CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{selectedCount} / {section.items.length} 件</span>
                      <Button variant="outline" size="sm" onClick={() => toggleSection(section.items, !allSelected)}>
                        {allSelected ? '全解除' : '全選択'}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? <p className="text-sm text-muted-foreground">読み込み中...</p> : (
                    <div className="space-y-1.5 max-h-[38vh] overflow-y-auto pr-1">
                      {section.items.map((product) => (
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
            )
          })}
        </div>

        {/* プレビュー（セクション・ページごと） */}
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">プレビュー（1920×1080）</p>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 rounded-md border bg-background px-2 text-sm"
              >
                <option value={16}>高レア 16枚 / ページ</option>
                <option value={24}>高レア 24枚 / ページ</option>
                <option value={32}>高レア 32枚 / ページ</option>
              </select>
              <span className="text-sm text-muted-foreground">全 {pageJobs.length} ページ</span>
            </div>
            <Button onClick={() => downloadPages(pageJobs)} disabled={downloading || pageJobs.length === 0} className="gap-2">
              <Download className="h-4 w-4" />
              {downloading ? '生成中...' : `PNG 一括ダウンロード（${pageJobs.length}枚）`}
            </Button>
          </div>

          {pageJobs.map((job) => (
            <div key={job.key} className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground font-medium">
                  {job.sectionLabel} {job.pageCount > 1 ? `${job.pageNo} / ${job.pageCount}` : ''}（{job.products.length}枚）
                </p>
                <Button variant="outline" size="sm" onClick={() => downloadPages([job])} disabled={downloading} className="gap-1 h-7 text-xs">
                  <Download className="h-3 w-3" />
                  このページのみ
                </Button>
              </div>
              <div className="border rounded-lg bg-muted/30" style={{ width: Math.ceil(1920 * 0.35), height: Math.ceil(1080 * 0.35), overflow: 'hidden', position: 'relative' }}>
                <div style={{ transform: 'scale(0.35)', transformOrigin: 'top left', width: '1920px', height: '1080px', position: 'absolute', top: 0, left: 0 }}>
                  <Single30thCanvas
                    ref={(el) => { pageRefs.current[job.key] = el }}
                    products={job.products}
                    highPriceIds={highPriceIds}
                    sectionLabel={job.sectionLabel}
                    sectionLabelEn={job.sectionLabelEn}
                    pageNo={job.pageNo}
                    pageCount={job.pageCount}
                    cols={job.cols}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// --- Canvas (1920 × 1080) ---
const Single30thCanvas = React.forwardRef<HTMLDivElement, {
  products: ProductWithRelations[]
  highPriceIds: Set<string>
  sectionLabel: string
  sectionLabelEn: string
  pageNo: number
  pageCount: number
  cols: number
}>(({ products, highPriceIds, sectionLabel, sectionLabelEn, pageNo, pageCount, cols }, ref) => {
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
      {/* Background image（30th専用・左上の白六角形にロゴを重ねる） */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/single-30th-bg.png"
        alt=""
        style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, zIndex: 0 }}
        crossOrigin="anonymous"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/logo-full.png"
        alt=""
        style={{ position: 'absolute', left: 97, top: 93, width: 140, height: 140, zIndex: 1 }}
        crossOrigin="anonymous"
      />

      {/* Section label */}
      <div style={{
        position: 'absolute', left: padX, top: gridTop - 28, zIndex: 3,
        background: '#dc2626', color: '#fff', padding: '2px 14px',
        fontSize: 14, fontWeight: 900, letterSpacing: '0.1em',
        borderRadius: 3, border: '2px solid #111', boxShadow: '2px 2px 0 #111',
      }}>
        30th CELEBRATION {sectionLabel} <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em' }}>{sectionLabelEn}</span>
        {pageCount > 1 && <span style={{ fontSize: 11, fontWeight: 700, marginLeft: 8 }}>{pageNo}/{pageCount}</span>}
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
