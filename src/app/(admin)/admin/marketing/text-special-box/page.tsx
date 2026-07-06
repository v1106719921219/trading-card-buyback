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

const SETTING_KEY = 'sns_special_box_default_products'
const CATEGORY_ID = 'db02ec12-d529-453c-a749-53da99e05533'
const SPECIAL_BOX_SUBCATEGORY_NAME = 'スペシャルボックス'

const DEFAULT_HEADER = `🎁ポケモンカード スペシャルボックス 高価買取中🎁`

const DEFAULT_FOOTER = `お気軽にお尋ねください
▼ 買取価格一覧 ▼から
kaitorisquare.com/prices
手続きは簡単！LINEから気軽に買取査定が可能です。
http://lin.ee/MYCtHk9`

type ProductWithRelations = Product & {
  category: Category | null
  subcategory: Subcategory | null
}

function formatProductLine(product: ProductWithRelations): string {
  const price = product.price > 0 ? `${product.price.toLocaleString('ja-JP')}円` : 'ASK'
  return `${product.name}🔥\n👉【${price}】`
}

export default function SpecialBoxTextPage() {
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

    const { data: specialBoxSub } = await supabase
      .from('subcategories')
      .select('id')
      .eq('category_id', CATEGORY_ID)
      .eq('name', SPECIAL_BOX_SUBCATEGORY_NAME)
      .maybeSingle()

    if (!specialBoxSub?.id) {
      toast.error('スペシャルボックスのサブカテゴリが見つかりません')
      setLoading(false)
      return
    }

    const [productsResult, settingResult] = await Promise.all([
      supabase
        .from('products')
        .select('*, category:categories(*), subcategory:subcategories(*)')
        .eq('is_active', true)
        .eq('category_id', CATEGORY_ID)
        .eq('subcategory_id', specialBoxSub.id)
        .order('sort_order'),
      supabase.from('app_settings').select('value').eq('key', SETTING_KEY).maybeSingle(),
    ])

    if (productsResult.error) {
      toast.error('商品の取得に失敗しました')
      setLoading(false)
      return
    }

    const prods = (productsResult.data || []) as ProductWithRelations[]
    setProducts(prods)

    if (settingResult.data?.value) {
      try {
        const savedIds: string[] = JSON.parse(settingResult.data.value)
        setSelectedIds(new Set(savedIds.filter((id) => prods.some((p) => p.id === id))))
      } catch {
        setSelectedIds(new Set(prods.map((p) => p.id)))
      }
    } else {
      setSelectedIds(new Set(prods.map((p) => p.id)))
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
      ({ error } = await supabase.from('app_settings').insert({ key: SETTING_KEY, value, description: 'スペシャルボックスのデフォルト掲載商品IDリスト', tenant_id: tenantId }))
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
    } catch { toast.error('コピーに失敗しました') }
  }

  return (
    <div>
      <AdminHeader
        title="スペシャルボックス投稿文生成"
        description="スペシャルボックスの買取価格からSNS投稿用テキストを自動生成します"
      />
      <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">ヘッダーテキスト</CardTitle></CardHeader>
            <CardContent><Textarea value={header} onChange={(e) => setHeader(e.target.value)} rows={2} className="resize-none font-mono text-sm" /></CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">掲載する商品</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{selectedIds.size} / {products.length} 件</span>
                  <Button variant="outline" size="sm" onClick={toggleAll}>
                    {selectedIds.size === products.length ? '全解除' : '全選択'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={saveDefaults} disabled={saving} className="gap-1">
                    <Save className="h-3.5 w-3.5" />デフォルトとして保存
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
                  {products.map((product) => (
                    <label
                      key={product.id}
                      className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted transition-colors"
                    >
                      <Checkbox checked={selectedIds.has(product.id)} onCheckedChange={() => toggleProduct(product.id)} />
                      <span className="flex-1 text-sm font-medium truncate">{product.name}</span>
                      <Badge variant="secondary" className="shrink-0 tabular-nums text-xs">
                        {product.price > 0 ? `${product.price.toLocaleString('ja-JP')}円` : 'ASK'}
                      </Badge>
                    </label>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">フッターテキスト</CardTitle></CardHeader>
            <CardContent><Textarea value={footer} onChange={(e) => setFooter(e.target.value)} rows={5} className="resize-none font-mono text-sm" /></CardContent>
          </Card>
        </div>

        <div>
          <Card className="sticky top-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">プレビュー・コピー</CardTitle>
                <Button onClick={handleCopy} className="gap-2">
                  {copied ? <><Check className="h-4 w-4" />コピー済み</> : <><Copy className="h-4 w-4" />テキストをコピー</>}
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
