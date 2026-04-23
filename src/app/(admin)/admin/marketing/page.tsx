'use client'

import { useEffect, useState, useCallback } from 'react'
import { AdminHeader } from '@/components/admin/header'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Copy, Check, RefreshCw, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Product, Category, Subcategory } from '@/types/database'

const SETTING_KEY = 'sns_post_default_products'
const CATEGORY_ID = 'db02ec12-d529-453c-a749-53da99e05533'
const SHRINK_SUBCATEGORY_ID = '7fc8c032-c373-438a-bc14-6a9e8c113767'
const NO_SHRINK_SUBCATEGORY_ID = '9c1bdee7-e844-4be7-a298-de73d8af5670'

const DEFAULT_HEADER = `🔥🔥10BOX以上の買取依頼で着払OK🔥🔥`

const DEFAULT_FOOTER = `お気軽にお尋ねください  そのほかは
▼ 買取価格一覧 ▼から
kaitorisquare.com/prices
手続きは簡単！LINEから気軽に買取査定が可能です。 こちらからお問い合わせください
http://lin.ee/MYCtHk9`

type ProductWithRelations = Product & {
  category: Category | null
  subcategory: Subcategory | null
  price_no_shrink?: number | null
}

function formatProductLine(product: ProductWithRelations): string {
  const price = product.price.toLocaleString('ja-JP')
  if (product.price_no_shrink && product.price_no_shrink > 0) {
    const noShrinkPrice = product.price_no_shrink.toLocaleString('ja-JP')
    return `${product.name}🔥\n👉【${price}円 / シュリ無 ${noShrinkPrice}円】`
  }
  return `${product.name}🔥\n👉【${price}円】`
}

export default function MarketingPage() {
  const [products, setProducts] = useState<ProductWithRelations[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [header, setHeader] = useState(DEFAULT_HEADER)
  const [footer, setFooter] = useState(DEFAULT_FOOTER)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    setLoading(true)

    const [productsResult, noShrinkResult, settingResult] = await Promise.all([
      supabase
        .from('products')
        .select('*, category:categories(*), subcategory:subcategories(*)')
        .eq('is_active', true)
        .eq('category_id', CATEGORY_ID)
        .eq('subcategory_id', SHRINK_SUBCATEGORY_ID)
        .order('sort_order'),
      supabase
        .from('products')
        .select('name, price')
        .eq('is_active', true)
        .eq('category_id', CATEGORY_ID)
        .eq('subcategory_id', NO_SHRINK_SUBCATEGORY_ID),
      supabase
        .from('app_settings')
        .select('value')
        .eq('key', SETTING_KEY)
        .maybeSingle(),
    ])

    if (productsResult.error) {
      toast.error('商品の取得に失敗しました')
      setLoading(false)
      return
    }

    // Build no-shrink price map
    const noShrinkPriceMap = new Map<string, number>()
    if (noShrinkResult.data) {
      for (const ns of noShrinkResult.data) {
        const baseName = ns.name.replace(/\s*シュリンク無し\s*$/, '').trim()
        if (ns.price > 0) noShrinkPriceMap.set(baseName, ns.price)
      }
    }

    const prods = ((productsResult.data || []) as ProductWithRelations[]).map((p) => ({
      ...p,
      price_no_shrink: noShrinkPriceMap.get(p.name) ?? null,
    }))
    setProducts(prods)

    // 保存済みのデフォルト選択があればそれを使用、なければ全選択
    if (settingResult.data?.value) {
      try {
        const savedIds: string[] = JSON.parse(settingResult.data.value)
        const validIds = new Set(savedIds.filter((id) => prods.some((p) => p.id === id)))
        setSelectedIds(validIds)
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

  function toggleAll() {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(products.map((p) => p.id)))
    }
  }

  async function saveDefaults() {
    setSaving(true)
    const value = JSON.stringify(Array.from(selectedIds))
    const tenantId = 'aaaaaaaa-0000-0000-0000-000000000001'
    const { data: existing } = await supabase.from('app_settings').select('key').eq('key', SETTING_KEY).maybeSingle()
    let error
    if (existing) {
      ({ error } = await supabase.from('app_settings').update({ value }).eq('key', SETTING_KEY))
    } else {
      ({ error } = await supabase.from('app_settings').insert({ key: SETTING_KEY, value, description: 'SNS投稿文のデフォルト掲載商品IDリスト', tenant_id: tenantId }))
    }
    setSaving(false)
    if (error) toast.error('保存に失敗しました')
    else toast.success('デフォルト選択を保存しました')
  }

  const selectedProducts = products.filter((p) => selectedIds.has(p.id))

  const generatedMessage = [
    header,
    '',
    ...selectedProducts.map((p) => formatProductLine(p)),
    '',
    footer,
  ].join('\n')

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(generatedMessage)
      setCopied(true)
      toast.success('コピーしました')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('コピーに失敗しました')
    }
  }

  return (
    <div>
      <AdminHeader
        title="SNS投稿文生成"
        description="現在の買取価格をもとにSNS投稿用テキストを自動生成します"
      />

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 左カラム: 設定 */}
        <div className="space-y-6">
          {/* ヘッダー */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">ヘッダーテキスト</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={header}
                onChange={(e) => setHeader(e.target.value)}
                rows={2}
                className="resize-none font-mono text-sm"
              />
            </CardContent>
          </Card>

          {/* 商品選択 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">掲載する商品</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {selectedIds.size} / {products.length} 件
                  </span>
                  <Button variant="outline" size="sm" onClick={toggleAll}>
                    {selectedIds.size === products.length ? '全解除' : '全選択'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={saveDefaults}
                    disabled={saving}
                    className="gap-1"
                  >
                    <Save className="h-3.5 w-3.5" />
                    デフォルトとして保存
                  </Button>
                  <Button variant="ghost" size="icon" onClick={fetchData} title="再読み込み">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                チェックを変更したら「デフォルトとして保存」で次回以降も同じ選択が維持されます
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">読み込み中...</p>
              ) : products.length === 0 ? (
                <p className="text-sm text-muted-foreground">表示対象の商品がありません</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {products.map((product) => {
                    return (
                      <label
                        key={product.id}
                        className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted transition-colors"
                      >
                        <Checkbox
                          checked={selectedIds.has(product.id)}
                          onCheckedChange={() => toggleProduct(product.id)}
                        />
                        <span className="flex-1 text-sm font-medium truncate">{product.name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant="secondary" className="tabular-nums text-xs">
                            {product.price.toLocaleString('ja-JP')}円
                          </Badge>
                          {product.price_no_shrink != null && product.price_no_shrink > 0 && (
                            <Badge variant="outline" className="tabular-nums text-xs text-muted-foreground">
                              シュリ無{product.price_no_shrink.toLocaleString('ja-JP')}円
                            </Badge>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* フッター */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">フッターテキスト</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={footer}
                onChange={(e) => setFooter(e.target.value)}
                rows={5}
                className="resize-none font-mono text-sm"
              />
            </CardContent>
          </Card>
        </div>

        {/* 右カラム: プレビュー */}
        <div>
          <Card className="sticky top-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">プレビュー・コピー</CardTitle>
                <Button onClick={handleCopy} className="gap-2">
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      コピー済み
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      テキストをコピー
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap font-sans text-sm bg-muted rounded-md p-4 max-h-[calc(100vh-20rem)] overflow-y-auto leading-relaxed">
                {generatedMessage}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
