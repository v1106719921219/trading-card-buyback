'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import React from 'react'
import { AdminHeader } from '@/components/admin/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Download, RefreshCw, Save, ImageIcon, Copy } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { formatXProductLine, xUpdateDateLine } from '@/lib/sns-text'
import type { Product, Category, Subcategory } from '@/types/database'

const SETTING_KEY = 'sns_psa10_default_products'
const DEFAULT_HEADER = '🃏PSA10鑑定カード 高価買取中🃏'
const DEFAULT_FOOTER = '▼ 買取価格一覧 ▼\nkaitorisquare.com/prices\n手続きは簡単！LINEから気軽に買取査定が可能です。\nhttp://lin.ee/MYCtHk9'
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
  'レシラム', 'ゼクロム', 'ゲッコウガ', 'ルカリオ', 'ミミッキュ',
  'ガブリアス', 'レックウザ', 'サーナイト', 'ルギア',
]
const OTHER_GROUP = 'その他'

function characterOf(name: string): string {
  return CHARACTER_GROUPS.find((c) => name.includes(c)) ?? OTHER_GROUP
}

// 関連するポケモンをまとめ、少数の商品だけで画像が増えないようにする。
const DISPLAY_GROUPS: { label: string; characters: string[] }[] = [
  { label: 'ピカチュウ', characters: ['ピカチュウ'] },
  { label: 'イーブイ・進化系', characters: ['イーブイ', 'ブラッキー', 'ニンフィア', 'エーフィ', 'リーフィア', 'グレイシア', 'シャワーズ', 'サンダース', 'ブースター'] },
  { label: 'ミュウ・ミュウツー・サーナイト', characters: ['ミュウ', 'ミュウツー', 'サーナイト'] },
  { label: 'ゲッコウガ・ルカリオ', characters: ['ゲッコウガ', 'ルカリオ'] },
  { label: 'ルギア・レックウザ', characters: ['ルギア', 'レックウザ'] },
  { label: 'リザードン・カイリュー・ガブリアス', characters: ['リザードン', 'カイリュー', 'ガブリアス'] },
  { label: 'ゲンガー・ミミッキュ・コイキング', characters: ['ゲンガー', 'ミミッキュ', 'コイキング'] },
  { label: 'レシラム・ゼクロム', characters: ['レシラム', 'ゼクロム'] },
]
function displayGroupOf(name: string): string {
  const character = characterOf(name)
  return DISPLAY_GROUPS.find((g) => g.characters.includes(character))?.label ?? character
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
  const [header, setHeader] = useState(DEFAULT_HEADER)
  const [footer, setFooter] = useState(DEFAULT_FOOTER)
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
        // 価格表に表示中の商品のみ掲載（非表示・締切・0円は除外）
        .eq('show_in_price_list', true)
        .gt('price', 0)
        .order('price', { ascending: false }),
      supabase.from('app_settings').select('value').eq('key', SETTING_KEY).maybeSingle(),
    ])

    if (productsResult.error) {
      toast.error('商品の取得に失敗しました')
      setLoading(false)
      return
    }

    // 表示グループ別 → 価格が高い順に整列（グループの並びは最高額の高い順）
    const raw = (productsResult.data || []) as ProductWithRelations[]
    const groupOrder = [...new Set(raw.map((p) => displayGroupOf(p.name)))]
      .sort((a, b) => {
        const maxA = Math.max(...raw.filter((p) => displayGroupOf(p.name) === a).map((p) => p.price))
        const maxB = Math.max(...raw.filter((p) => displayGroupOf(p.name) === b).map((p) => p.price))
        return maxB - maxA
      })
    const prods = groupOrder.flatMap((g) =>
      raw.filter((p) => displayGroupOf(p.name) === g).sort((a, b) => b.price - a.price)
    )
    setProducts(prods)

    if (settingResult.data?.value) {
      try {
        const saved = JSON.parse(settingResult.data.value)
        const savedIds: unknown[] = Array.isArray(saved) ? saved : saved.ids
        if (!Array.isArray(savedIds)) throw new Error('Invalid saved selection')
        const valid = savedIds.filter((id): id is string => typeof id === 'string' && prods.some((p) => p.id === id))
        setSelectedIds(new Set(valid))
        setHeader(typeof saved.header === 'string' ? saved.header : DEFAULT_HEADER)
        setFooter(typeof saved.footer === 'string' ? saved.footer : DEFAULT_FOOTER)
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
    const value = JSON.stringify({ ids: Array.from(selectedIds), header, footer })
    const { data: existing } = await supabase.from('app_settings').select('key').eq('key', SETTING_KEY).maybeSingle()
    let error
    if (existing) {
      ({ error } = await supabase.from('app_settings').update({ value }).eq('key', SETTING_KEY))
    } else {
      ({ error } = await supabase.from('app_settings').insert({ key: SETTING_KEY, value, description: 'PSA10買取画像の掲載商品・投稿文設定', tenant_id: TENANT_ID }))
    }
    setSaving(false)
    if (error) toast.error('保存に失敗しました')
    else toast.success('商品選択と投稿文設定を保存しました')
  }

  async function handleDownload() {
    setDownloading(true)
    try {
      await document.fonts.load('700 16px "Noto Sans JP"')
      await document.fonts.load('800 16px "Noto Sans JP"')
      await document.fonts.load('900 16px "Noto Sans JP"')
      await document.fonts.load('900 16px "Inter"')
      await document.fonts.ready

      const { toPng, getFontEmbedCSS } = await import('html-to-image')
      const JSZip = (await import('jszip')).default
      const dateStr = new Date().toLocaleDateString('ja-JP').replace(/\//g, '')
      const zip = new JSZip()
      let count = 0
      let fontEmbedCSS: string | undefined
      for (let i = 0; i < pages.length; i++) {
        const node = pageRefs.current[i]
        if (!node) continue
        // フォント埋め込みCSSの生成は重いので最初の1回だけ行い全ページで使い回す
        if (fontEmbedCSS === undefined) {
          fontEmbedCSS = await getFontEmbedCSS(node)
          await toPng(node, { quality: 1, pixelRatio: 2, fontEmbedCSS }) // 初回のみウォームアップ
        }
        const dataUrl = await toPng(node, { quality: 1, pixelRatio: 2, fontEmbedCSS })
        const page = pages[i]
        const suffix = page.pageNo > 0 ? `${page.pageNo}` : ''
        zip.file(`PSA10買取表_${page.group}${suffix}_${dateStr}.png`, dataUrl.split(',')[1], { base64: true })
        count++
      }
      // ブラウザの連続ダウンロード制限を避けるため1つのZIPにまとめる
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `PSA10買取表_${dateStr}.zip`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`${count}枚の画像をZIPでダウンロードしました`)
    } catch (e) {
      console.error(e)
      toast.error('画像の生成に失敗しました')
    } finally {
      setDownloading(false)
    }
  }

  const selectedProducts = products.filter((p) => selectedIds.has(p.id))
  const noImageCount = selectedProducts.filter((p) => !p.image_url).length

  // 表示グループ別にページ分割（48件/枚上限）。複数枚になる場合は
  // 48+1のような偏りを避けるため均等に配分する（例: 49件 → 25+24件）
  const pages: PageDef[] = []
  {
    const groups = [...new Set(selectedProducts.map((p) => displayGroupOf(p.name)))]
    for (const group of groups) {
      const groupProducts = selectedProducts.filter((p) => displayGroupOf(p.name) === group)
      const totalPages = Math.ceil(groupProducts.length / MAX_PER_PAGE)
      const perPage = Math.ceil(groupProducts.length / totalPages)
      for (let i = 0; i < totalPages; i++) {
        pages.push({
          group,
          pageNo: totalPages > 1 ? i + 1 : 0,
          totalPages,
          products: groupProducts.slice(i * perPage, (i + 1) * perPage),
        })
      }
    }
  }
  pageRefs.current.length = pages.length

  // 左リストのグループ見出し用
  const listGroups = [...new Set(products.map((p) => displayGroupOf(p.name)))]

  // 価格先頭型: 「¥29,000 ピカチュウ ミラー (SA-L)」。
  // 画像1枚（ページ）ごとに投稿文を分け、写真とセットで投稿できるようにする
  const pageMessages = pages.map((page) => {
    const label = page.pageNo > 0 ? `${page.group} ${CIRCLED[page.pageNo - 1] ?? page.pageNo}` : page.group
    const text = [
      header,
      xUpdateDateLine(),
      '',
      `【${label}】`,
      ...page.products.map((p) => formatXProductLine(p.name, p.price)),
      '',
      footer,
    ].join('\n')
    return { label, count: page.products.length, text }
  })

  async function copyPageMessage(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`「${label}」の投稿文をコピーしました`)
    } catch { toast.error('コピーに失敗しました。プレビューからコピーしてください') }
  }

  return (
    <div>
      <AdminHeader
        title="PSA10買取画像・投稿文生成"
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
                  <Button variant="outline" size="sm" onClick={saveDefaults} disabled={saving || loading} className="gap-1">
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
                    const groupProducts = products.filter((p) => displayGroupOf(p.name) === group)
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

        {/* Right: post text and download */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">SNS投稿文</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">画像と同じ選択商品・買取価格を反映します。「デフォルト保存」で商品選択と冒頭・末尾を保存できます。</p>
              <label className="block space-y-2 text-sm">
                <span>投稿文の冒頭</span>
                <Textarea aria-label="投稿文の冒頭" value={header} onChange={e => setHeader(e.target.value)} rows={2} disabled={loading} />
              </label>
              <label className="block space-y-2 text-sm">
                <span>投稿文の末尾</span>
                <Textarea aria-label="投稿文の末尾" value={footer} onChange={e => setFooter(e.target.value)} rows={4} disabled={loading} />
              </label>
              <div className="space-y-3">
                {pageMessages.map((m, i) => (
                  <div key={`${m.label}-${i}`} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {m.label}（{m.count}件）
                        <span className="ml-2 text-xs text-muted-foreground">{Array.from(m.text).length.toLocaleString('ja-JP')}文字</span>
                      </span>
                      <Button size="sm" onClick={() => copyPageMessage(m.text, m.label)} disabled={loading} className="gap-1.5">
                        <Copy className="h-3.5 w-3.5" />コピー
                      </Button>
                    </div>
                    <Textarea aria-label={`${m.label}の投稿文`} readOnly value={m.text} rows={6} className="font-mono text-xs" />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">画像1枚につき1投稿。同じ名前の画像とセットで投稿してください。</p>
            </CardContent>
          </Card>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              プレビュー（1920×1080）— {pages.length}枚（下に表示）
            </p>
            <Button onClick={handleDownload} disabled={downloading || pages.length === 0} className="gap-2">
              <Download className="h-4 w-4" />
              {downloading ? '生成中...' : `${pages.length}枚ダウンロード`}
            </Button>
          </div>
        </div>
      </div>

      {/* Previews: full width below for larger display */}
      <div className="mt-6 space-y-6">
        {pages.map((page, i) => (
          <div key={`${page.group}-${page.pageNo}`}>
            <p className="text-sm text-muted-foreground mb-1">
              {page.group}{page.pageNo > 0 ? ` ${page.pageNo}/${page.totalPages}` : ''}（{page.products.length}件）
            </p>
            <PreviewFrame>
              <PSA10Canvas
                ref={(el) => { pageRefs.current[i] = el }}
                products={page.products}
                groupLabel={page.group}
                pageLabel={page.pageNo > 0 ? CIRCLED[page.pageNo - 1] ?? `(${page.pageNo})` : undefined}
              />
            </PreviewFrame>
          </div>
        ))}
      </div>
    </div>
  )
}

// 画面幅に合わせて1920×1080のキャンバスを縮小表示するラッパー
function PreviewFrame({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.55)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setScale(Math.min(el.clientWidth / 1920, 1))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="border rounded-lg bg-muted/30 w-full overflow-hidden">
      <div style={{ width: '100%', height: Math.ceil(1080 * scale), overflow: 'hidden', position: 'relative' }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: '1920px', height: '1080px', position: 'absolute', top: 0, left: 0 }}>
          {children}
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
  const updatedDateStr = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' }).format(today) + ' 更新'

  const W = 1920
  const H = 1080
  const padX = 12
  const gap = 3

  // ヘッダーはHTML描画に変更しコンパクト化（~180px）。背景はテクスチャのみのflat版
  // フッター帯は ~950px〜
  const gridTop = 190
  const gridBottom = 942
  const gridH = gridBottom - gridTop
  const gridW = W - padX * 2

  // 件数に応じて列数を選び、画像全体を使ってカードを最大化する
  // （48件=12列×4行、30件=10列×3行、24件以下=2行 など。最大12列×4行）
  const CARD_ASPECT = 0.74
  const count = Math.max(products.length, 1)
  let cols = 12
  let bestCard = 0
  for (let c = 6; c <= 12; c++) {
    const r = Math.ceil(count / c)
    if (r > 4) continue
    const ch = Math.floor((gridH - gap * (r - 1)) / r)
    const cw = Math.floor((gridW - gap * (c - 1)) / c)
    const ih = ch - Math.max(Math.min(Math.floor(ch * 0.14), 44), 20)
    const cardW = Math.min(cw, Math.floor(ih * CARD_ASPECT))
    if (cardW > bestCard) { bestCard = cardW; cols = c }
  }
  const rows = Math.ceil(count / cols)

  const cellH = Math.floor((gridH - gap * (rows - 1)) / rows)

  // Card inner layout
  const priceBarH = Math.max(Math.min(Math.floor(cellH * 0.14), 44), 20)
  const nameH = Math.max(Math.min(Math.floor(cellH * 0.14), 44), 28)
  const modelH = 24
  const imgH = cellH - priceBarH - nameH - modelH - 4

  // セル幅はカードの縦横比に合わせて詰め、白余白をなくす（グリッド全体は中央寄せ）
  const availCellW = Math.floor((gridW - gap * (cols - 1)) / cols)
  const cellW = Math.min(availCellW, Math.floor(imgH * CARD_ASPECT) + 6)
  const totalGridW = cols * cellW + gap * (cols - 1)
  const gridOffsetX = Math.floor((W - totalGridW) / 2)

  const nameFontSize = Math.max(Math.min(Math.floor(nameH * 0.62), 18), 8)
  const priceFontSize = Math.max(Math.min(Math.floor(priceBarH * 0.75), 34), 14)

  // 最終行が中途半端な数のときは中央寄せ
  const lastRowCount = count - Math.floor((count - 1) / cols) * cols

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
      {/* Background image (テクスチャのみ) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/psa10-bg-flat.png"
        alt=""
        style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, objectFit: 'fill', zIndex: 0 }}
        crossOrigin="anonymous"
      />

      {/* Logo inside white circle */}
      <div style={{
        position: 'absolute', left: 56, top: 18, width: 150, height: 150,
        borderRadius: '50%', zIndex: 4, background: '#fff',
        border: `3px solid ${P.BASE}`,
        boxShadow: `0 0 18px rgba(232,194,92,0.55)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/logo-full.png" alt="買取スクエア" style={{ width: 165, height: 165, objectFit: 'contain' }} crossOrigin="anonymous" />
      </div>

      {/* Title + Pokemon name (HTML描画・コンパクトヘッダー)
          右端の更新日プレート(約280px)と被らないよう、その分を除いた領域の中央に置き、
          長いグループ名はフォントを段階的に縮める */}
      <div style={{
        position: 'absolute', left: 240, right: 330, top: 30, zIndex: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28,
      }}>
        <span style={{
          fontSize: 96, fontWeight: 900, lineHeight: 1,
          letterSpacing: '0.04em', whiteSpace: 'nowrap',
          background: `linear-gradient(180deg, ${P.WHITE} 0%, ${P.LIGHT} 30%, ${P.BASE} 62%, ${P.DARK} 88%, ${P.MID} 100%)`,
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          filter: `drop-shadow(0 0 16px rgba(232,194,92,0.5)) drop-shadow(0 3px 4px rgba(0,0,0,0.9))`,
        }}>PSA10買取表</span>
        {groupLabel && (() => {
          const nameFontSize = groupLabel.length > 12 ? 30 : groupLabel.length > 8 ? 38 : 46
          return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 12,
            background: 'linear-gradient(180deg, rgba(10,8,2,0.95) 0%, rgba(28,20,6,0.95) 100%)',
            border: `2px solid ${P.MID}`,
            borderRadius: 999,
            padding: '10px 30px 12px',
            boxShadow: `0 0 14px rgba(232,194,92,0.4), inset 0 1px 0 rgba(255,251,232,0.25)`,
          }}>
            <span style={{
              fontSize: nameFontSize, fontWeight: 900, lineHeight: 1,
              letterSpacing: '0.06em', whiteSpace: 'nowrap',
              background: `linear-gradient(180deg, ${P.WHITE} 0%, ${P.LIGHT} 35%, ${P.BASE} 70%, ${P.MID} 100%)`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: `drop-shadow(0 1px 2px rgba(0,0,0,0.9))`,
            }}>{groupLabel}</span>
            {pageLabel && (
              <span style={{
                fontSize: nameFontSize, fontWeight: 900, lineHeight: 1, color: P.LIGHT,
                textShadow: `0 0 12px ${P.BASE}, 0 1px 3px rgba(0,0,0,0.8)`,
              }}>{pageLabel}</span>
            )}
          </span>
          )
        })()}
      </div>

      {/* Update date plaque (top-right) */}
      <div style={{
        position: 'absolute', right: 44, top: 40, zIndex: 4,
        padding: '14px 30px',
        background: 'linear-gradient(180deg, rgba(10,8,2,0.95) 0%, rgba(28,20,6,0.95) 100%)',
        border: `2px solid ${P.MID}`, borderRadius: 10,
        boxShadow: `0 0 12px rgba(232,194,92,0.35)`,
        color: P.LIGHT, fontSize: 30, fontWeight: 900,
        letterSpacing: '0.06em', whiteSpace: 'nowrap',
        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
      }}>{updatedDateStr}</div>

      {/* Product cards - absolute positioning */}
      {products.map((product, index) => {
        const col = index % cols
        const row = Math.floor(index / cols)
        const isLastRow = row === Math.floor((count - 1) / cols)
        const rowOffset = isLastRow && lastRowCount < cols
          ? Math.floor(((cols - lastRowCount) * (cellW + gap)) / 2)
          : 0
        const x = gridOffsetX + rowOffset + col * (cellW + gap)
        const y = gridTop + row * (cellH + gap)
        const cardName = product.name.replace(/\s*\[[^\]]+\]/g, '').replace(/\s*PSA10\s*$/i, '').trim()
        const setCode = product.set_number?.trim() || product.name.match(/\[([^\]]+)\]/)?.[1] || ''
        const modelCode = product.model_number?.trim() || ''
        const cardCode = [setCode, ...(modelCode && !setCode.includes(modelCode) ? [modelCode] : [])].filter(Boolean).join(' / ')
        const codeFontSize = Math.min(20, Math.max(9, Math.floor((cellW - 12) / Math.max(cardCode.length, 1) / 0.65)))

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

            </div>
            {/* Keep the card number on a dedicated line, separate from the product name. */}
            <div style={{ height: nameH, padding: '2px 4px', boxSizing: 'border-box', background: '#191919', color: '#fff', fontSize: nameFontSize, fontWeight: 900, textAlign: 'center', lineHeight: 1.15, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {cardName}
            </div>
            <div data-card-code={cardCode} style={{ height: modelH, background: '#191919', color: P.LIGHT, fontFamily: "'Inter', sans-serif", fontSize: codeFontSize, fontWeight: 800, textAlign: 'center', lineHeight: modelH + 'px', whiteSpace: 'nowrap' }}>
              {cardCode || '型番未登録'}
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
