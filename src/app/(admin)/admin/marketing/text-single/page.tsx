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

const SETTING_KEY = 'sns_single_promo_default_products'
const CATEGORY_ID = 'db02ec12-d529-453c-a749-53da99e05533'
const SINGLE_SUBCATEGORY_ID = '19b8ce8e-1380-42ea-ba7a-0e2a0ad8a0b9'
const PROMO_SUBCATEGORY_ID = '14d18906-99e2-4efe-81bd-f7e6d0f1972c'
const SPECIAL_BOX_SUBCATEGORY_NAME = 'スペシャルボックス'

const DEFAULT_HEADER = `🃏ポケモンカード シングル＆プロモ 高価買取中🃏`

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
  const price = product.price > 0 ? `${product.price.toLocaleString('ja-JP')}円` : '応談'
  return `${product.name}👉【${price}】`
}

export default function SinglePromoTextPage() {
  const [singles, setSingles] = useState<ProductWithRelations[]>([])
  const [promos, setPromos] = useState<ProductWithRelations[]>([])
  const [specialBoxes, setSpecialBoxes] = useState<ProductWithRelations[]>([])
  const [selectedSingleIds, setSelectedSingleIds] = useState<Set<string>>(new Set())
  const [selectedPromoIds, setSelectedPromoIds] = useState<Set<string>>(new Set())
  const [selectedSpecialBoxIds, setSelectedSpecialBoxIds] = useState<Set<string>>(new Set())
  const [header, setHeader] = useState(DEFAULT_HEADER)
  const [footer, setFooter] = useState(DEFAULT_FOOTER)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    setLoading(true)

    // スペシャルボックスのサブカテゴリIDを動的に取得
    const { data: specialBoxSub } = await supabase
      .from('subcategories')
      .select('id')
      .eq('category_id', CATEGORY_ID)
      .eq('name', SPECIAL_BOX_SUBCATEGORY_NAME)
      .maybeSingle()

    const specialBoxSubId = specialBoxSub?.id

    const [singlesResult, promosResult, specialBoxResult, settingResult] = await Promise.all([
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
      specialBoxSubId
        ? supabase
            .from('products')
            .select('*, category:categories(*), subcategory:subcategories(*)')
            .eq('is_active', true)
            .eq('category_id', CATEGORY_ID)
            .eq('subcategory_id', specialBoxSubId)
            .order('sort_order')
        : Promise.resolve({ data: [], error: null }),
      supabase.from('app_settings').select('value').eq('key', SETTING_KEY).maybeSingle(),
    ])

    if (singlesResult.error || promosResult.error || specialBoxResult.error) {
      toast.error('商品の取得に失敗しました')
      setLoading(false)
      return
    }

    const s = (singlesResult.data || []) as ProductWithRelations[]
    const p = (promosResult.data || []) as ProductWithRelations[]
    const sb = (specialBoxResult.data || []) as ProductWithRelations[]
    setSingles(s)
    setPromos(p)
    setSpecialBoxes(sb)

    if (settingResult.data?.value) {
      try {
        const saved: { singles: string[]; promos: string[]; specialBoxes?: string[] } = JSON.parse(settingResult.data.value)
        setSelectedSingleIds(new Set(saved.singles.filter((id) => s.some((x) => x.id === id))))
        setSelectedPromoIds(new Set(saved.promos.filter((id) => p.some((x) => x.id === id))))
        setSelectedSpecialBoxIds(new Set((saved.specialBoxes || []).filter((id) => sb.some((x) => x.id === id))))
      } catch {
        setSelectedSingleIds(new Set(s.map((x) => x.id)))
        setSelectedPromoIds(new Set(p.map((x) => x.id)))
        setSelectedSpecialBoxIds(new Set(sb.map((x) => x.id)))
      }
    } else {
      setSelectedSingleIds(new Set(s.map((x) => x.id)))
      setSelectedPromoIds(new Set(p.map((x) => x.id)))
      setSelectedSpecialBoxIds(new Set(sb.map((x) => x.id)))
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchData() }, [fetchData])

  function toggleSingle(id: string) {
    setSelectedSingleIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function togglePromo(id: string) {
    setSelectedPromoIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function toggleSpecialBox(id: string) {
    setSelectedSpecialBoxIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  async function saveDefaults() {
    setSaving(true)
    const value = JSON.stringify({ singles: Array.from(selectedSingleIds), promos: Array.from(selectedPromoIds), specialBoxes: Array.from(selectedSpecialBoxIds) })
    const tenantId = 'aaaaaaaa-0000-0000-0000-000000000001'
    const { data: existing } = await supabase.from('app_settings').select('key').eq('key', SETTING_KEY).maybeSingle()
    let error
    if (existing) {
      ({ error } = await supabase.from('app_settings').update({ value }).eq('key', SETTING_KEY))
    } else {
      ({ error } = await supabase.from('app_settings').insert({ key: SETTING_KEY, value, description: 'シングル・プロモのデフォルト掲載商品', tenant_id: tenantId }))
    }
    setSaving(false)
    if (error) toast.error('保存に失敗しました')
    else toast.success('デフォルト選択を保存しました')
  }

  const selectedSingles = singles.filter((p) => selectedSingleIds.has(p.id))
  const selectedPromos = promos.filter((p) => selectedPromoIds.has(p.id))
  const selectedSpecialBoxProducts = specialBoxes.filter((p) => selectedSpecialBoxIds.has(p.id))

  const generatedMessage = [
    header,
    '',
    ...(selectedSingles.length > 0 ? ['【シングルカード】', ...selectedSingles.map(formatProductLine), ''] : []),
    ...(selectedPromos.length > 0 ? ['【プロモカード】', ...selectedPromos.map(formatProductLine), ''] : []),
    ...(selectedSpecialBoxProducts.length > 0 ? ['【スペシャルボックス】', ...selectedSpecialBoxProducts.map(formatProductLine), ''] : []),
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
        title="シングル・プロモ投稿文生成"
        description="シングル＆プロモカードの買取価格からSNS投稿用テキストを自動生成します"
      />
      <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">ヘッダーテキスト</CardTitle></CardHeader>
            <CardContent><Textarea value={header} onChange={(e) => setHeader(e.target.value)} rows={2} className="resize-none font-mono text-sm" /></CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">シングルカード</CardTitle>
                <span className="text-sm text-muted-foreground">{selectedSingleIds.size} / {singles.length} 件</span>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <p className="text-sm text-muted-foreground">読み込み中...</p> : (
                <div className="space-y-1.5 max-h-[25vh] overflow-y-auto pr-1">
                  {singles.map((p) => (
                    <label key={p.id} className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted transition-colors">
                      <Checkbox checked={selectedSingleIds.has(p.id)} onCheckedChange={() => toggleSingle(p.id)} />
                      <span className="flex-1 text-sm truncate">{p.name}</span>
                      <Badge variant="secondary" className="shrink-0 tabular-nums text-xs">
                        {p.price > 0 ? `${p.price.toLocaleString('ja-JP')}円` : '応談'}
                      </Badge>
                    </label>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">プロモカード</CardTitle>
                <span className="text-sm text-muted-foreground">{selectedPromoIds.size} / {promos.length} 件</span>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <p className="text-sm text-muted-foreground">読み込み中...</p> : (
                <div className="space-y-1.5 max-h-[25vh] overflow-y-auto pr-1">
                  {promos.map((p) => (
                    <label key={p.id} className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted transition-colors">
                      <Checkbox checked={selectedPromoIds.has(p.id)} onCheckedChange={() => togglePromo(p.id)} />
                      <span className="flex-1 text-sm truncate">{p.name}</span>
                      <Badge variant="secondary" className="shrink-0 tabular-nums text-xs">
                        {p.price > 0 ? `${p.price.toLocaleString('ja-JP')}円` : '応談'}
                      </Badge>
                    </label>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">スペシャルボックス</CardTitle>
                <span className="text-sm text-muted-foreground">{selectedSpecialBoxIds.size} / {specialBoxes.length} 件</span>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <p className="text-sm text-muted-foreground">読み込み中...</p> : (
                <div className="space-y-1.5 max-h-[25vh] overflow-y-auto pr-1">
                  {specialBoxes.map((p) => (
                    <label key={p.id} className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted transition-colors">
                      <Checkbox checked={selectedSpecialBoxIds.has(p.id)} onCheckedChange={() => toggleSpecialBox(p.id)} />
                      <span className="flex-1 text-sm truncate">{p.name}</span>
                      <Badge variant="secondary" className="shrink-0 tabular-nums text-xs">
                        {p.price > 0 ? `${p.price.toLocaleString('ja-JP')}円` : '応談'}
                      </Badge>
                    </label>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">フッターテキスト</CardTitle></CardHeader>
            <CardContent><Textarea value={footer} onChange={(e) => setFooter(e.target.value)} rows={4} className="resize-none font-mono text-sm" /></CardContent>
          </Card>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={saveDefaults} disabled={saving} className="gap-1">
              <Save className="h-3.5 w-3.5" />デフォルト保存
            </Button>
            <Button variant="ghost" size="icon" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
          </div>
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
