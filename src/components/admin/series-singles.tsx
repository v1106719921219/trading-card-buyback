'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import React from 'react'
import { CardImage } from '@/components/admin/card-image'
import { singleSeriesCode } from '@/lib/single-series'
import { AdminHeader } from '@/components/admin/header'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Download, RefreshCw, Save, ImageIcon, Copy } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { formatXProductLine, xUpdateDateLine } from '@/lib/sns-text'
import type { Product, Category, Subcategory } from '@/types/database'



const DEFAULT_FOOTER = '▼ 買取価格一覧 ▼\nkaitorisquare.com/prices\n手続きは簡単！LINEから気軽に買取査定が可能です。\nhttp://lin.ee/MYCtHk9'
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

function balancedPages<T>(items: T[], maxPerPage: number): T[][] {
  if (items.length === 0) return []
  const count = Math.ceil(items.length / maxPerPage)
  const base = Math.floor(items.length / count)
  const extra = items.length % count
  let offset = 0
  return Array.from({ length: count }, (_, i) => {
    const size = base + (i < extra ? 1 : 0)
    const page = items.slice(offset, offset + size)
    offset += size
    return page
  })
}

export default function SeriesSingles({ code, name, seriesOptions = [] }: { code: string; name: string; seriesOptions?: { code: string; name: string }[] }) {
  const isMultiple = code === 'MULTI'
  const [activeSeries, setActiveSeries] = useState<string[]>([])
  const [sortMode, setSortMode] = useState<'price' | 'series'>('price')
  const productSeries = (p: Product) => p.subcategory_id === SUBCATEGORY_ID ? 'M6A' : singleSeriesCode(p)
  const is30th = code === 'M6A'
  const SETTING_KEY = is30th ? 'sns_30th_single_default_products' : `sns_single_series_${code.toLowerCase()}`
  const DEFAULT_HEADER = isMultiple ? '🃏ポケモンカード シングル買取強化中🃏' : `🃏${name} シングルカード 高価買取中🃏`
  const [products, setProducts] = useState<ProductWithRelations[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [highPriceIds, setHighPriceIds] = useState<Set<string>>(new Set())
  const [header, setHeader] = useState(DEFAULT_HEADER)
  const [footer, setFooter] = useState(DEFAULT_FOOTER)
  const [pageSize, setPageSize] = useState(32)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState('')
  const exportFontCache = useRef<{ text: string; css: string } | null>(null)
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
        .in('subcategory_id', isMultiple ? [SUBCATEGORY_ID, '19b8ce8e-1380-42ea-ba7a-0e2a0ad8a0b9'] : is30th ? [SUBCATEGORY_ID] : ['19b8ce8e-1380-42ea-ba7a-0e2a0ad8a0b9'])
        .order('sort_order'),
      supabase.from('app_settings').select('value').eq('key', SETTING_KEY).maybeSingle(),
    ])

    if (productsResult.error) {
      toast.error('商品の取得に失敗しました')
      setLoading(false)
      return
    }

    const s = ((productsResult.data || []) as ProductWithRelations[]).filter(p => isMultiple || is30th || singleSeriesCode(p) === code)
    setProducts(s)
    setHeader(DEFAULT_HEADER)
    setFooter(DEFAULT_FOOTER)

    if (settingResult.data?.value) {
      try {
        const saved: { singles: string[]; header?: string; footer?: string; series?: string[]; sort?: 'price' | 'series' } = JSON.parse(settingResult.data.value)
        if (isMultiple) {
          setActiveSeries(Array.isArray(saved.series) ? saved.series.filter(c => typeof c === 'string') : [])
          setSortMode(saved.sort === 'series' ? 'series' : 'price')
        }
        const savedHeader = typeof saved.header === 'string' ? saved.header : DEFAULT_HEADER
        // 旧画面から保存された標準文面も移行。利用者が編集した文面は維持する。
        setHeader(isMultiple && savedHeader.trim() === '🃏ポケモン合同 シングルカード 高価買取中🃏' ? DEFAULT_HEADER : savedHeader)
        setFooter(typeof saved.footer === 'string' ? saved.footer : DEFAULT_FOOTER)
        setSelectedIds(new Set(saved.singles.filter((id) => s.some((x) => x.id === id && (is30th || x.price > 0)))))
      } catch {
        if (isMultiple) { setActiveSeries([]); setSortMode('price') }
        setSelectedIds(new Set(isMultiple ? [] : s.filter(x => is30th || x.price > 0).map((x) => x.id)))
      }
    } else {
      if (isMultiple) { setActiveSeries([]); setSortMode('price') }
      setSelectedIds(new Set(isMultiple ? [] : s.filter(x => is30th || x.price > 0).map((x) => x.id)))
    }

    setLoading(false)
  }, [supabase, code, is30th, isMultiple, SETTING_KEY, DEFAULT_HEADER])

  useEffect(() => { fetchData() }, [fetchData])

  const visibleProducts = useMemo(() => products.filter(p => !isMultiple || activeSeries.includes(p.subcategory_id === SUBCATEGORY_ID ? 'M6A' : singleSeriesCode(p))), [products, isMultiple, activeSeries])
  const compareProducts = useCallback((a: Product, b: Product) => {
    if (!isMultiple) return (b.market_price ?? -1) - (a.market_price ?? -1) || cardNum(a) - cardNum(b)
    const ac = a.subcategory_id === SUBCATEGORY_ID ? 'M6A' : singleSeriesCode(a)
    const bc = b.subcategory_id === SUBCATEGORY_ID ? 'M6A' : singleSeriesCode(b)
    return (sortMode === 'series' ? ac.localeCompare(bc, 'ja', { numeric: true }) : 0) || b.price - a.price || a.name.localeCompare(b.name, 'ja')
  }, [isMultiple, sortMode])
  function toggleSeries(seriesCode: string) {
    const remove = activeSeries.includes(seriesCode)
    setActiveSeries(prev => remove ? prev.filter(c => c !== seriesCode) : [...prev, seriesCode])
    setSelectedIds(prev => {
      const next = new Set(prev)
      for (const p of products.filter(p => productSeries(p) === seriesCode)) {
        if (remove) next.delete(p.id)
        else if (p.price > 0) next.add(p.id)
      }
      return next
    })
  }

  // 高レアはスニダン相場の高い順（相場未取得は末尾・同額はカード番号順）
  const rares = useMemo(() =>
    visibleProducts
      .filter((p) => !is30th || cardNum(p) >= HIGH_RARE_MIN_NUM)
      .sort(compareProducts),
  [visibleProducts, is30th, compareProducts])
  // ミラーピカチュウはカード番号順、コンプセットは末尾
  const pikachus = useMemo(() =>
    products
      .filter((p) => is30th && cardNum(p) < HIGH_RARE_MIN_NUM)
      .sort((a, b) => {
        const compA = p2comp(a); const compB = p2comp(b)
        return compA - compB || cardNum(a) - cardNum(b)
      }),
  [products, is30th])

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
        if (selectAll && (is30th || p.price > 0)) next.add(p.id); else next.delete(p.id)
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
    const value = JSON.stringify({ singles: Array.from(selectedIds), header, footer, ...(isMultiple ? { series: activeSeries, sort: sortMode } : {}) })
    const tenantId = 'aaaaaaaa-0000-0000-0000-000000000001'
    const { data: existing } = await supabase.from('app_settings').select('key').eq('key', SETTING_KEY).maybeSingle()
    let error
    if (existing) {
      ({ error } = await supabase.from('app_settings').update({ value }).eq('key', SETTING_KEY))
    } else {
      ({ error } = await supabase.from('app_settings').insert({ key: SETTING_KEY, value, description: `${name}の掲載商品・投稿文設定`, tenant_id: tenantId }))
    }
    setSaving(false)
    if (error) toast.error('保存に失敗しました')
    else toast.success('商品選択と投稿文設定を保存しました')
  }

  // 選択したミラーピカチュウも通常カードの続きにまとめてページ分割する。
  const pageJobs = useMemo<PageJob[]>(() => {
    const selected = [...rares, ...pikachus].filter(p => selectedIds.has(p.id))
    const pages = balancedPages(selected, pageSize)
    return pages.map((items, i) => ({
      key: `シングル-${i}`,
      sectionLabel: 'シングルカード',
      sectionLabelEn: 'SINGLE CARDS',
      fileLabel: 'シングル',
      pageNo: i + 1,
      pageCount: pages.length,
      cols: is30th ? 8 : Math.min(8, items.length),
      products: items,
    }))
  }, [rares, pikachus, selectedIds, pageSize, is30th])

  async function downloadPages(jobs: PageJob[]) {
    if (downloading || jobs.length === 0) return
    setDownloading(true)
    setDownloadProgress('画像を準備中…')
    let completed = 0
    try {
      const nodes = jobs.map(job => {
        const node = pageRefs.current[job.key]
        if (!node) throw new Error('プレビューが準備できていません')
        return node
      })
      // html-to-image の全フォント走査を避け、今回使用する文字だけを取得。
      // 共通CSSを全ページで再利用し、再ダウンロード時も文字が同じなら再取得しない。
      const text = Array.from(new Set(nodes.map(node => node.textContent || '').join(''))).sort().join('')
      let fontEmbedCSS = exportFontCache.current?.text === text ? exportFontCache.current.css : undefined
      if (!fontEmbedCSS) {
        const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700;900&display=block&text=${encodeURIComponent(text)}`
        const response = await fetch(cssUrl)
        if (!response.ok) throw new Error('フォントの取得に失敗しました')
        let css = await response.text()
        const urls = Array.from(new Set(Array.from(css.matchAll(/url\((['"]?)(.*?)\1\)/g), match => match[2])))
        if (urls.length === 0) throw new Error('フォントが見つかりません')
        const embedded = await Promise.all(urls.map(async url => {
          const fontResponse = await fetch(url)
          if (!fontResponse.ok) throw new Error('フォントの取得に失敗しました')
          const blob = await fontResponse.blob()
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = () => reject(new Error('フォントの読込に失敗しました'))
            reader.readAsDataURL(blob)
          })
          return { url, dataUrl }
        }))
        for (const { url, dataUrl } of embedded) css = css.split(url).join(dataUrl)
        fontEmbedCSS = css
        exportFontCache.current = { text, css }
      }
      // 元画像の読込完了を待つことで、捨て描画（2回生成）を不要にする。
      await Promise.all(nodes.flatMap(node => Array.from(node.querySelectorAll('img')).map(img => img.decode())))
      const { toBlob } = await import('html-to-image')
      const options = { pixelRatio: 2, fontEmbedCSS }
      const date = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }).replace(/\//g, '')
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i]
        setDownloadProgress(`画像を生成中 ${i + 1}/${jobs.length}`)
        const blob = await toBlob(nodes[i], options)
        if (!blob) throw new Error('画像の生成に失敗しました')
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const suffix = job.pageCount > 1 ? `_${job.pageNo}` : ''
        a.download = `${name}シングル買取価格表_${job.fileLabel}${suffix}_${date}.png`
        a.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
        completed++
        // 連続ダウンロードのブラウザ制限を避ける（最後の待機は不要）。
        if (i < jobs.length - 1) await new Promise(r => setTimeout(r, 400))
      }
      toast.success(`${completed}枚の画像をダウンロードしました`)
    } catch (e) {
      console.error(e)
      toast.error(`画像の生成に失敗しました（${completed}/${jobs.length}枚完了）。再読み込みしてお試しください`)
    } finally {
      setDownloading(false)
      setDownloadProgress('')
    }
  }

  const sectionCards = [
    { title: is30th ? '高レアカード（AR / SAR / ex）' : `${name}の登録カード`, items: rares },
    { title: 'ミラーピカチュウ（017〜046）', items: pikachus },
  ]

  const postSections = [
    { title: '高レア・コンプリートセット', items: rares },
    { title: 'ミラーピカチュウ', items: pikachus },
  ]
  // 価格先頭型: 「¥23,000 リザードン (137/103)」。高い順に並べる。
  // ミラーピカチュウが全て同額のときは30行並べず1行にまとめる
  const generatedMessage = [header, xUpdateDateLine(), '', ...postSections.flatMap(({ title, items }) => {
    const selected = items.filter(p => selectedIds.has(p.id))
    if (!selected.length) return []
    if (title === 'ミラーピカチュウ') {
      const mirrors = selected.filter(p => /^ピカチュウ \(0(1[7-9]|2\d|3\d|4[0-6])\/103\)/.test(p.name))
      const others = selected.filter(p => !mirrors.includes(p))
      const prices = [...new Set(mirrors.map(p => p.price))]
      if (mirrors.length > 1 && prices.length === 1) {
        return [
          `【${title}】`,
          `¥${prices[0].toLocaleString('ja-JP')} ミラーピカチュウ 全${mirrors.length}種 どれでも (017〜046/103)`,
          ...[...others].sort((a, b) => b.price - a.price).map(p => formatXProductLine(is30th ? p.name : p.name.replace(/\[([^\]]+)\]/g, '($1)'), p.price)),
          '',
        ]
      }
    }
    return [...(title === '高レア・コンプリートセット' ? [] : [`【${title}】`]), ...[...selected].sort(isMultiple ? compareProducts : (a, b) => b.price - a.price).map(p => formatXProductLine(is30th ? p.name : p.name.replace(/\[([^\]]+)\]/g, '($1)'), p.price)), '']
  }), footer].join('\n')

  async function copyPost() {
    try {
      await navigator.clipboard.writeText(generatedMessage)
      toast.success('投稿文をコピーしました')
    } catch { toast.error('コピーに失敗しました') }
  }

  return (
    <div>
      <AdminHeader
        title={`${name} シングル買取一覧`}
        description="シリーズ別の買取価格一覧・SNS投稿文・価格画像を生成します（1920×1080・ページ自動分割）"
      />

      {isMultiple && <div className="mt-4 rounded-lg border p-4 space-y-3">
        <p className="text-sm">一緒に載せるシリーズを選択してください。価格設定済みの商品が選択され、個別に外すこともできます。</p>
        <div className="flex flex-wrap gap-3 max-h-44 overflow-y-auto">
          {seriesOptions.map(s => <label key={s.code} className="flex items-center gap-2 text-sm rounded border px-3 py-2">
            <Checkbox aria-label={`${s.name}を含める`} disabled={loading} checked={activeSeries.includes(s.code)} onCheckedChange={() => toggleSeries(s.code)} />{s.name}
          </label>)}
        </div>
        <label className="flex items-center gap-2 text-sm">画像・投稿文の並び順
          <select aria-label="画像・投稿文の並び順" className="rounded border px-3 py-2" value={sortMode} onChange={e => setSortMode(e.target.value as 'price' | 'series')}>
            <option value="price">買取価格の高い順</option><option value="series">シリーズ順（各シリーズ内は価格順）</option>
          </select>
        </label>
      </div>}
      {!loading && <p className="mt-4 text-sm text-muted-foreground">登録 {visibleProducts.length}件 ／ 価格設定済み {visibleProducts.filter(p => p.price > 0).length}件 ／ 画像あり {visibleProducts.filter(p => p.image_url).length}件。価格・受付の変更と相場更新は商品管理から行えます。通常シングルの参考相場は状態Aの最安出品価格です。通常シングルは価格設定後に画像へ掲載できます。</p>}
      {!loading && visibleProducts.length === 0 && <p className="mt-4 rounded border p-4">{isMultiple ? 'シリーズを選択すると商品が表示されます。' : 'このシリーズの商品はまだ登録されていません。'}</p>}
      <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2 rounded-lg border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">
              「デフォルトとして保存」で商品選択と投稿文の冒頭・末尾を保存できます
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">計 {visibleProducts.filter(p => selectedIds.has(p.id)).length} 件選択中</span>
              <Button variant="outline" size="sm" onClick={saveDefaults} disabled={saving || loading} className="gap-1">
                <Save className="h-3.5 w-3.5" />
                デフォルトとして保存
              </Button>
            </div>
          </div>

          {sectionCards.filter(section => is30th || section.items.length > 0).map((section) => {
            const selectedCount = section.items.filter((p) => selectedIds.has(p.id)).length
            const allSelected = selectedCount > 0 && selectedCount === section.items.filter(p => is30th || p.price > 0).length
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
                          <Checkbox disabled={!is30th && product.price <= 0} checked={selectedIds.has(product.id)} onCheckedChange={() => toggleProduct(product.id)} />
                          {product.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={product.image_url} alt="" className="w-8 h-8 object-cover rounded shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded border bg-muted flex items-center justify-center shrink-0"><ImageIcon className="h-4 w-4 text-muted-foreground/40" /></div>
                          )}
                          <span className="flex-1 text-sm truncate">{product.name}</span>
                          {product.market_price != null && (
                            <span title={product.market_price_updated_at ? `取得: ${new Date(product.market_price_updated_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}` : '取得日時不明'} className="shrink-0 text-xs text-muted-foreground tabular-nums">{is30th ? '相場' : '参考相場'} {product.market_price.toLocaleString('ja-JP')}円</span>
                          )}
                          <Badge variant="secondary" className="shrink-0 tabular-nums text-xs">{product.price > 0 ? `${product.price.toLocaleString('ja-JP')}円` : '価格未設定'}</Badge>
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

        {/* 投稿文と価格画像は同じ商品選択を使用 */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">SNS投稿文</CardTitle>
              <p className="text-sm text-muted-foreground">チェックした商品と現在の買取価格を反映します。</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="block text-sm space-y-1">
                <span>投稿文の冒頭</span>
                <Textarea aria-label="投稿文の冒頭" value={header} onChange={e => setHeader(e.target.value)} rows={2} />
              </label>
              <label className="block text-sm space-y-1">
                <span>投稿文の末尾</span>
                <Textarea aria-label="投稿文の末尾" value={footer} onChange={e => setFooter(e.target.value)} rows={4} />
              </label>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">{Array.from(generatedMessage).length}文字（投稿先の文字数制限を確認してください）</span>
                <Button onClick={copyPost} disabled={loading || !visibleProducts.some(p => selectedIds.has(p.id))} className="gap-2"><Copy className="h-4 w-4" />投稿文をコピー</Button>
              </div>
              <Textarea aria-label="投稿文プレビュー" readOnly value={generatedMessage} rows={14} className="font-mono text-sm" />
            </CardContent>
          </Card>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">プレビュー（1920×1080）</p>
              <select
                aria-label="画像の分割方法"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 rounded-md border bg-background px-2 text-sm"
              >
                <option value={16}>最大16枚・均等分割</option>
                <option value={24}>最大24枚・均等分割</option>
                <option value={32}>自動（32枚まで1枚）</option>
              </select>
              <span className="text-sm text-muted-foreground">全 {pageJobs.length} ページ</span>
            </div>
            <Button onClick={() => downloadPages(pageJobs)} disabled={downloading || pageJobs.length === 0} className="gap-2">
              <Download className="h-4 w-4" />
              {downloading ? downloadProgress : `PNG 一括ダウンロード（${pageJobs.length}枚）`}
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
                    seriesName={name}
                    is30th={is30th}
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
  seriesName: string
  is30th: boolean
  products: ProductWithRelations[]
  highPriceIds: Set<string>
  sectionLabel: string
  sectionLabelEn: string
  pageNo: number
  pageCount: number
  cols: number
}>(({ seriesName, is30th, products, highPriceIds, sectionLabel, sectionLabelEn, pageNo, pageCount, cols }, ref) => {
  const updatedAt = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '.')

  const W = 1920
  const H = 1080
  const padX = 20
  const gap = 4

  // 通常シリーズはロゴだけのコンパクトなヘッダーにする。
  const gridTop = is30th ? 310 : 100
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
        hidden={!is30th}
        src="/assets/single-30th-bg.png"
        alt=""
        style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, zIndex: 0 }}
        crossOrigin="anonymous"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/logo-full.png"
        hidden={!is30th}
        alt=""
        style={{ position: 'absolute', left: 97, top: 93, width: 140, height: 140, zIndex: 1 }}
        crossOrigin="anonymous"
      />

      {!is30th && <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top right, #fff3aa, transparent 65%), linear-gradient(135deg, #fbbf24, #fff3a0 50%, #f59e0b)', zIndex: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/logo-full.png" alt="" crossOrigin="anonymous" style={{ position: 'absolute', left: padX, top: 8, width: 84, height: 84, objectFit: 'contain' }} />
      </div>}
      {!is30th && pageCount > 1 && <div style={{ position: 'absolute', top: 38, right: padX, fontSize: 20, fontWeight: 700, color: '#171717' }}>{pageNo} / {pageCount}</div>}
      {/* Section label */}
      {is30th && <div style={{
        position: 'absolute', left: padX, top: gridTop - 28, zIndex: 3,
        background: '#dc2626', color: '#fff', padding: '2px 14px',
        fontSize: 14, fontWeight: 900, letterSpacing: '0.1em',
        borderRadius: 3, border: '2px solid #111', boxShadow: '2px 2px 0 #111',
      }}>
        {seriesName} {sectionLabel} <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em' }}>{sectionLabelEn}</span>
        {pageCount > 1 && <span style={{ fontSize: 11, fontWeight: 700, marginLeft: 8 }}>{pageNo}/{pageCount}</span>}
      </div>}

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
                <CardImage src={product.image_url} alt={product.name} />
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
