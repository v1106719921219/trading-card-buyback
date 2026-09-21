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
// 12列×4行 = 48件で1枚
const MAX_PER_PAGE = 48

// ポケモン別グループ（先に長い名前からマッチさせる: ミュウツー→ミュウ の順が必須）
const CHARACTER_GROUPS = [
  'ミュウツー', 'ミュウ', 'リザードン', 'ピカチュウ', 'ブラッキー', 'イーブイ',
  'ニンフィア', 'エーフィ', 'リーフィア', 'グレイシア', 'シャワーズ', 'サンダース',
  'ブースター', 'コイキング', 'ゲンガー', 'カイリュー',
]
const OTHER_GROUP = 'その他'

function characterOf(name: string): string {
  return CHARACTER_GROUPS.find((c) => name.includes(c)) ?? OTHER_GROUP
}

// Gold palette
const P = {
  WHITE: '#fffbe8',
  LIGHT: '#fde8a4',
  BASE: '#e8c25c',
  MID: '#d4a853',
  DARK: '#8a6a2a',
  DEEP: '#5a4518',
}

type ProductWithRelations = Product & {
  category: Category | null
  subcategory: Subcategory | null
}

type PageDef = {
  group: string
  /** グループ内のページ番号（1始まり）。グループが1枚に収まる場合は0 */
  pageNo: number
  totalPages: number
  products: ProductWithRelations[]
}

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']

export default function PSA10ImagePage() {
  const [products, setProducts] = useState<ProductWithRelations[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [saving, setSaving] = useState(false)
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])
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
        .gt('price', 0)
        .order('price', { ascending: false }),
      supabase.from('app_settings').select('value').eq('key', SETTING_KEY).maybeSingle(),
    ])

    if (productsResult.error) {
      toast.error('商品の取得に失敗しました')
      setLoading(false)
      return
    }

    // ポケモン別 → 価格が高い順に整列（グループの並びは最高額の高い順）
    const raw = (productsResult.data || []) as ProductWithRelations[]
    const groupOrder = [...new Set(raw.map((p) => characterOf(p.name)))]
      .sort((a, b) => {
        const maxA = Math.max(...raw.filter((p) => characterOf(p.name) === a).map((p) => p.price))
        const maxB = Math.max(...raw.filter((p) => characterOf(p.name) === b).map((p) => p.price))
        return maxB - maxA
      })
    const prods = groupOrder.flatMap((g) =>
      raw.filter((p) => characterOf(p.name) === g).sort((a, b) => b.price - a.price)
    )
    setProducts(prods)

    if (settingResult.data?.value) {
      try {
        const savedIds: string[] = JSON.parse(settingResult.data.value)
        const valid = savedIds.filter((id) => prods.some((p) => p.id === id))
        setSelectedIds(valid.length > 0 ? new Set(valid) : new Set(prods.map((p) => p.id)))
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

  function toggleGroup(group: string, ids: string[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const allSelected = ids.every((id) => next.has(id))
      for (const id of ids) {
        if (allSelected) next.delete(id)
        else next.add(id)
      }
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

  async function downloadNode(node: HTMLDivElement, filename: string) {
    const { toPng } = await import('html-to-image')
    const options = { quality: 1, pixelRatio: 2 }
    await toPng(node, options) // warm up
    const dataUrl = await toPng(node, options)
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
      let count = 0
      for (let i = 0; i < pages.length; i++) {
        const node = pageRefs.current[i]
        if (!node) continue
        const page = pages[i]
        const suffix = page.pageNo > 0 ? `${page.pageNo}` : ''
        await downloadNode(node, `PSA10買取表_${page.group}${suffix}_${dateStr}.png`)
        count++
      }
      toast.success(`${count}枚の画像をダウンロードしました`)
    } catch (e) {
      console.error(e)
      toast.error('画像の生成に失敗しました')
    } finally {
      setDownloading(false)
    }
  }

  const selectedProducts = products.filter((p) => selectedIds.has(p.id))
  const noImageCount = selectedProducts.filter((p) => !p.image_url).length

  // ポケモン別にページ分割（各グループ48件/枚。複数枚になるグループは①②…を付ける）
  const pages: PageDef[] = []
  {
    const groups = [...new Set(selectedProducts.map((p) => characterOf(p.name)))]
    for (const group of groups) {
      const groupProducts = selectedProducts.filter((p) => characterOf(p.name) === group)
      const totalPages = Math.ceil(groupProducts.length / MAX_PER_PAGE)
      for (let i = 0; i < totalPages; i++) {
        pages.push({
          group,
          pageNo: totalPages > 1 ? i + 1 : 0,
          totalPages,
          products: groupProducts.slice(i * MAX_PER_PAGE, (i + 1) * MAX_PER_PAGE),
        })
      }
    }
  }
  pageRefs.current.length = pages.length

  // 左リストのグループ見出し用
  const listGroups = [...new Set(products.map((p) => characterOf(p.name)))]

  return (
    <div>
      <AdminHeader
        title="PSA10買取画像生成"
        description="PSA10鑑定カードの買取価格画像をポケモン別に自動生成します（1920×1080 / 12×4=48枚毎）"
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
                  {listGroups.map((group) => {
                    const groupProducts = products.filter((p) => characterOf(p.name) === group)
                    const groupIds = groupProducts.map((p) => p.id)
                    const selectedCount = groupIds.filter((id) => selectedIds.has(id)).length
                    return (
                      <div key={group}>
                        <div className="flex items-center gap-2 sticky top-0 bg-background py-1.5 z-10 border-b">
                          <Checkbox
                            checked={selectedCount === groupIds.length}
                            onCheckedChange={() => toggleGroup(group, groupIds)}
                          />
                          <span className="text-sm font-bold">{group}</span>
                          <span className="text-xs text-muted-foreground">
                            {selectedCount}/{groupIds.length}件
                          </span>
                        </div>
                        {groupProducts.map((product) => (
                          <label
                            key={product.id}
                            className="flex items-center gap-3 rounded-md border px-3 py-2 mt-1.5 cursor-pointer hover:bg-muted transition-colors"
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
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: previews */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              プレビュー（1920×1080）— {pages.length}枚
            </p>
            <Button onClick={handleDownload} disabled={downloading || pages.length === 0} className="gap-2">
              <Download className="h-4 w-4" />
              {downloading ? '生成中...' : `${pages.length}枚ダウンロード`}
            </Button>
          </div>

          {pages.map((page, i) => (
            <div key={`${page.group}-${page.pageNo}`}>
              <p className="text-sm text-muted-foreground mb-1">
                {page.group}{page.pageNo > 0 ? ` ${page.pageNo}/${page.totalPages}` : ''}（{page.products.length}件）
              </p>
              <div className="border rounded-lg bg-muted/30" style={{ width: Math.ceil(1920 * 0.35), height: Math.ceil(1080 * 0.35), overflow: 'hidden', position: 'relative' }}>
                <div style={{ transform: 'scale(0.35)', transformOrigin: 'top left', width: '1920px', height: '1080px', position: 'absolute', top: 0, left: 0 }}>
                  <PSA10Canvas
                    ref={(el) => { pageRefs.current[i] = el }}
                    products={page.products}
                    groupLabel={page.group}
                    pageLabel={page.pageNo > 0 ? CIRCLED[page.pageNo - 1] ?? `(${page.pageNo})` : undefined}
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

// --- PSA10 Canvas (1920x1080) ---
const PSA10Canvas = React.forwardRef<HTMLDivElement, {
  products: ProductWithRelations[]
  groupLabel?: string
  pageLabel?: string
}>(({ products, groupLabel, pageLabel }, ref) => {
  const today = new Date()
  const month = today.getMonth() + 1
  const day = today.getDate()
  const updatedDateStr = `${month}月${day}日 更新`

  const W = 1920
  const H = 1080
  const padX = 12
  const gap = 3

  // 背景画像のレイアウトに合わせた座標（ヘッダー帯 ~310px、フッター帯 ~990px〜）
  const gridTop = 322
  const gridBottom = 980
  const gridH = gridBottom - gridTop
  const gridW = W - padX * 2

  // 12列×4行固定（48件でぴったり埋まる。端数でもセルサイズは変えない）
  const cols = 12
  const rows = 4

  const cellW = Math.floor((gridW - gap * (cols - 1)) / cols)
  const cellH = Math.floor((gridH - gap * (rows - 1)) / rows)

  // Card inner layout
  const priceBarH = Math.max(Math.min(Math.floor(cellH * 0.14), 34), 20)
  const nameH = Math.max(Math.min(Math.floor(cellH * 0.11), 26), 14)
  const imgH = cellH - priceBarH
  const nameFontSize = Math.max(Math.min(Math.floor(nameH * 0.62), 13), 8)
  const priceFontSize = Math.max(Math.min(Math.floor(priceBarH * 0.75), 26), 14)

  return (
    <div
      ref={ref}
      style={{
        width: W,
        height: H,
        background: '#000',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: '"Noto Sans JP", sans-serif',
        boxSizing: 'border-box',
        color: '#fff',
      }}
    >
      {/* Background image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/psa10-bg.png"
        alt=""
        style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, objectFit: 'fill', zIndex: 0 }}
        crossOrigin="anonymous"
      />

      {/* Logo inside white circle (top-left of bg) */}
      <div style={{
        position: 'absolute', left: 100, top: 54, width: 205, height: 205,
        borderRadius: '50%', zIndex: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/logo-full.png" alt="買取スクエア" style={{ width: 235, height: 235, objectFit: 'contain' }} crossOrigin="anonymous" />
      </div>

      {/* Pokemon name plate (title right side) */}
      {groupLabel && (
        <div style={{
          position: 'absolute', left: 1400, top: 160, zIndex: 4,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{
            fontSize: 58, fontWeight: 900, lineHeight: 1,
            letterSpacing: '0.04em', whiteSpace: 'nowrap',
            background: `linear-gradient(180deg, ${P.WHITE} 0%, ${P.LIGHT} 35%, ${P.BASE} 70%, ${P.MID} 100%)`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            filter: `drop-shadow(0 0 10px rgba(232,194,92,0.55)) drop-shadow(0 2px 3px rgba(0,0,0,0.9))`,
          }}>{groupLabel}</span>
          {pageLabel && (
            <span style={{
              fontSize: 58, fontWeight: 900, lineHeight: 1, color: P.LIGHT,
              textShadow: `0 0 12px ${P.BASE}, 0 2px 4px rgba(0,0,0,0.8)`,
            }}>{pageLabel}</span>
          )}
        </div>
      )}

      {/* Update date inside top-right plaque */}
      <div style={{
        position: 'absolute', left: 1565, top: 46, width: 315, height: 84, zIndex: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: P.LIGHT, fontSize: 30, fontWeight: 900,
        letterSpacing: '0.06em', whiteSpace: 'nowrap',
        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
      }}>{updatedDateStr}</div>

      {/* Product cards - absolute positioning */}
      {products.map((product, index) => {
        const col = index % cols
        const row = Math.floor(index / cols)
        const x = padX + col * (cellW + gap)
        const y = gridTop + row * (cellH + gap)

        return (
          <div key={product.id} style={{
            position: 'absolute', left: x, top: y, width: cellW, height: cellH,
            background: '#fff',
            border: `1.5px solid ${P.BASE}`,
            borderRadius: 3,
            overflow: 'hidden', zIndex: 2,
            boxSizing: 'border-box',
            boxShadow: `0 0 6px rgba(212,168,83,0.35)`,
          }}>
            {/* Image area */}
            <div style={{ position: 'relative', width: '100%', height: imgH, background: '#fff' }}>
              {product.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.image_url}
                  alt={product.name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  crossOrigin="anonymous"
                />
              ) : (
                <div style={{
                  width: '100%', height: '100%',
                  background: 'repeating-linear-gradient(135deg, #f3f3f3 0 8px, #eaeaea 8px 16px)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'rgba(138,106,42,0.5)', fontSize: 11,
                  fontWeight: 700, letterSpacing: '0.2em',
                }}>
                  NO IMAGE
                </div>
              )}

              {/* Name strip over bottom of image */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 3,
                background: 'rgba(0,0,0,0.7)',
                padding: '2px 3px',
                fontSize: nameFontSize, fontWeight: 900, color: '#fff',
                textAlign: 'center', lineHeight: 1.2,
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
              }}>
                {product.name}
              </div>
            </div>

            {/* Price bar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(180deg, #dc2626 0%, #b91c1c 50%, #7f1d1d 100%)',
              height: priceBarH,
              borderTop: `1px solid ${P.BASE}`,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
            }}>
              <span style={{
                color: '#fff', fontSize: priceFontSize, fontWeight: 900,
                lineHeight: 1, letterSpacing: '-0.01em',
                fontFamily: "'Inter', sans-serif",
                textShadow: '0 1px 2px rgba(0,0,0,0.6)',
              }}>
                ¥{product.price.toLocaleString('ja-JP')}
              </span>
            </div>
          </div>
        )
      })}

      {/* Footer */}
      <footer style={{
        position: 'absolute', top: 1000, left: padX, right: padX, height: 66,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, color: '#aaa',
        letterSpacing: '0.04em', zIndex: 4,
      }}>
        <span>※買取価格は日付当日限り有効です。相場や在庫状況によって予告なく変更になる場合がございます。</span>
      </footer>
    </div>
  )
})
PSA10Canvas.displayName = 'PSA10Canvas'
