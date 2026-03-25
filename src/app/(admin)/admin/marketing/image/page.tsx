'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { AdminHeader } from '@/components/admin/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Download, RefreshCw, Save, ImageIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Product, Category, Subcategory } from '@/types/database'

const SETTING_KEY = 'sns_post_default_products'

type ProductWithRelations = Product & {
  category: Category | null
  subcategory: Subcategory | null
}

export default function MarketingImagePage() {
  const [products, setProducts] = useState<ProductWithRelations[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [saving, setSaving] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // Noto Sans JPをページに動的に読み込む
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700;900&display=swap'
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
        .eq('show_in_price_list', true)
        .order('sort_order'),
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

    const prods = (productsResult.data || []) as ProductWithRelations[]
    setProducts(prods)

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

  async function saveDefaults() {
    setSaving(true)
    const ids = Array.from(selectedIds)
    const { error } = await supabase
      .from('app_settings')
      .upsert(
        { key: SETTING_KEY, value: JSON.stringify(ids), description: 'SNS投稿文のデフォルト掲載商品IDリスト' },
        { onConflict: 'key' }
      )
    setSaving(false)
    if (error) toast.error('保存に失敗しました')
    else toast.success('デフォルト選択を保存しました')
  }

  async function handleDownload() {
    if (!previewRef.current) return
    setDownloading(true)
    try {
      // フォントが完全に読み込まれるまで待機
      await document.fonts.load('700 16px "Noto Sans JP"')
      await document.fonts.load('900 16px "Noto Sans JP"')
      await document.fonts.ready

      const { toPng } = await import('html-to-image')
      const options = { quality: 1, pixelRatio: 3 }

      // 1回目：フォントキャッシュを温める（html-to-imageの既知の挙動対策）
      await toPng(previewRef.current, options)
      // 2回目：実際の出力
      const dataUrl = await toPng(previewRef.current, options)

      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `買取価格_${new Date().toLocaleDateString('ja-JP').replace(/\//g, '')}.png`
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
  const noImageCount = selectedProducts.filter((p) => !p.image_url).length

  return (
    <div>
      <AdminHeader
        title="SNS価格画像生成"
        description="商品画像と現在の価格から投稿用画像を自動生成します"
      />

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 左: 商品選択 */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">掲載する商品</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {selectedIds.size} / {products.length} 件
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={saveDefaults}
                    disabled={saving}
                    className="gap-1"
                  >
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
                  ⚠ 画像未設定の商品が {noImageCount} 件あります（商品管理から画像を登録してください）
                </p>
              )}
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">読み込み中...</p>
              ) : (
                <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
                  {products.map((product) => (
                    <label
                      key={product.id}
                      className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted transition-colors"
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
              )}
            </CardContent>
          </Card>
        </div>

        {/* 右: プレビュー */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">プレビュー（実際の画像サイズ: 1600×900 / X推奨）</p>
            <Button onClick={handleDownload} disabled={downloading || selectedIds.size === 0} className="gap-2">
              <Download className="h-4 w-4" />
              {downloading ? '生成中...' : 'PNG ダウンロード'}
            </Button>
          </div>

          {/* 画像プレビュー本体 */}
          <div className="overflow-auto border rounded-lg">
            <div style={{ transform: 'scale(0.38)', transformOrigin: 'top left', width: '1600px', height: '900px' }}>
              <PriceImageCanvas ref={previewRef} products={selectedProducts} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

import React from 'react'

const PriceImageCanvas = React.forwardRef<HTMLDivElement, { products: ProductWithRelations[] }>(
  ({ products }, ref) => {
    // 最大24件（6列×4行）
    const displayProducts = products.slice(0, 24)

    return (
      <div
        ref={ref}
        style={{
          width: '1600px',
          height: '900px',
          background: 'linear-gradient(150deg, #FFE800 0%, #FFBA00 60%, #FF9500 100%)',
          fontFamily: '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif',
          padding: '24px 32px',
          boxSizing: 'border-box',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ヘッダー */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            {/* ロゴバッジ */}
            <div style={{
              background: '#222222',
              color: 'white',
              fontSize: '18px',
              fontWeight: 900,
              padding: '5px 14px',
              borderRadius: '6px',
              letterSpacing: '0.05em',
              boxShadow: '0 3px 0 #000000',
            }}>
              買取スクエア
            </div>
            {/* タイトル：縁取り文字 */}
            <div style={{
              fontSize: '44px',
              fontWeight: 900,
              color: '#111111',
              letterSpacing: '0.06em',
              textShadow: [
                '-3px -3px 0 white',
                ' 3px -3px 0 white',
                '-3px  3px 0 white',
                ' 3px  3px 0 white',
                '-3px  0   0 white',
                ' 3px  0   0 white',
                ' 0   -3px 0 white',
                ' 0    3px 0 white',
                ' 4px  4px 0 rgba(0,0,0,0.15)',
              ].join(','),
            }}>
              買い取り商品
            </div>
          </div>

          {/* 吹き出し（強化版） */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {/* 吹き出しの尾 */}
            <div style={{
              position: 'absolute',
              bottom: '-14px',
              left: '20px',
              width: 0,
              height: 0,
              borderLeft: '12px solid transparent',
              borderRight: '12px solid transparent',
              borderTop: '16px solid #CC0000',
            }} />
            <div style={{
              position: 'absolute',
              bottom: '-10px',
              left: '23px',
              width: 0,
              height: 0,
              borderLeft: '9px solid transparent',
              borderRight: '9px solid transparent',
              borderTop: '12px solid white',
            }} />
            {/* 吹き出し本体 */}
            <div style={{
              background: 'white',
              border: '5px solid #CC0000',
              borderRadius: '16px',
              padding: '10px 18px',
              textAlign: 'center',
              boxShadow: '3px 3px 0 rgba(204,0,0,0.35)',
              minWidth: '130px',
            }}>
              <div style={{ fontSize: '13px', fontWeight: 900, color: '#CC0000', lineHeight: 1.5, whiteSpace: 'nowrap' }}>
                ✨ 全種シュリンクあり！ ✨
              </div>
            </div>
          </div>
        </div>

        {/* 仕切り線 */}
        <div style={{ height: '4px', background: '#CC0000', borderRadius: '2px', marginBottom: '12px', flexShrink: 0, boxShadow: '0 2px 0 rgba(0,0,0,0.1)' }} />

        {/* 商品グリッド（白ボックスなし・6列） */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gridTemplateRows: 'repeat(4, 1fr)',
          gap: '10px 14px',
          flex: 1,
          overflow: 'hidden',
        }}>
          {displayProducts.map((product) => (
            <div
              key={product.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                overflow: 'hidden',
              }}
            >
              {/* 商品画像（白ボックスなし） */}
              <div style={{ flex: 1, width: '100%', overflow: 'hidden', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {product.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.image_url}
                    alt={product.name}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.3))' }}
                    crossOrigin="anonymous"
                  />
                ) : (
                  <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.4)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: '10px' }}>
                    NO IMAGE
                  </div>
                )}
              </div>
              {/* 商品名 */}
              <div style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#1a1a1a',
                textAlign: 'center',
                lineHeight: 1.3,
                width: '100%',
                flexShrink: 0,
              }}>
                {product.name}
              </div>
              {/* 価格 */}
              <div style={{
                fontSize: '13px',
                fontWeight: 900,
                color: '#111111',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}>
                【{product.price.toLocaleString('ja-JP')}円】
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
)
PriceImageCanvas.displayName = 'PriceImageCanvas'
