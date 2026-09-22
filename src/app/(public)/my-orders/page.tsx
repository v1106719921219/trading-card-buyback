'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Header } from '@/components/public/header'
import { Footer } from '@/components/public/footer'
import { Package, FileDown, Plus, Minus, X, Search } from 'lucide-react'
import { toast } from 'sonner'
import { initLiff } from '@/lib/liff-client'
import { getMyOrdersByIdToken, submitTrackingByIdToken, createMyInspectionPdfLink, getMyOrderAddableProducts, addMyOrderItems } from '@/actions/orders'

// お客様自身で商品を追加できるステータス（検品が始まる前まで）
const ADDABLE_STATUSES = ['承認待ち', '申込', '発送済']

interface AddableProduct {
  id: string
  name: string
  price: number
  category_name: string
  subcategory_name: string
}

// お客様向けのステータス表示（社内ステータスをお客様にわかる言葉に変換）
const CUSTOMER_STATUS: Record<string, { label: string; color: string; step: number }> = {
  '承認待ち': { label: '受付確認中', color: 'bg-purple-100 text-purple-800', step: 1 },
  '申込': { label: '受付完了（発送待ち）', color: 'bg-blue-100 text-blue-800', step: 2 },
  '発送済': { label: '発送済み（到着待ち）', color: 'bg-yellow-100 text-yellow-800', step: 3 },
  '検品完了': { label: '検品完了（お振込準備中）', color: 'bg-green-100 text-green-800', step: 4 },
  '振込済': { label: 'お振込み完了', color: 'bg-emerald-100 text-emerald-800', step: 5 },
  '振込確認済': { label: 'お取引完了', color: 'bg-gray-100 text-gray-700', step: 5 },
  'キャンセル': { label: 'キャンセル', color: 'bg-red-100 text-red-800', step: 0 },
}

interface MyOrder {
  order_number: string
  status: string
  total_amount: number
  inspected_total_amount: number | null
  inspection_discount: number | null
  tracking_number: string | null
  office_id: string | null
  created_at: string
  // 出所DB（東京/千葉）。追跡登録・PDF取得を正しいDBへ振り分けるために保持
  _db?: string
}

export default function MyOrdersPage() {
  const [loading, setLoading] = useState(true)
  const [inLine, setInLine] = useState(true)
  const [orders, setOrders] = useState<MyOrder[]>([])
  const [idToken, setIdToken] = useState<string | null>(null)
  const [trackingInput, setTrackingInput] = useState<Record<string, string>>({})
  const [submittingTracking, setSubmittingTracking] = useState<string | null>(null)

  async function loadOrders(token: string) {
    const data = await getMyOrdersByIdToken(token)
    setOrders(data as MyOrder[])
  }

  useEffect(() => {
    // ?u=<署名トークン> があればそれで本人特定（LIFF不要・本物アカウント用）
    const u = new URLSearchParams(window.location.search).get('u')
    if (u) {
      setIdToken(u)
      loadOrders(u).finally(() => setLoading(false))
      return
    }
    // なければLIFF（LINEアプリ内）で本人特定
    initLiff().then(async (state) => {
      if (!state.inLiff || !state.idToken) {
        setInLine(false)
        setLoading(false)
        return
      }
      setIdToken(state.idToken)
      await loadOrders(state.idToken)
      setLoading(false)
    })
  }, [])

  async function handleSubmitTracking(orderNumber: string, db?: string) {
    const value = (trackingInput[orderNumber] ?? '').trim()
    if (!value || !idToken) return
    setSubmittingTracking(orderNumber)
    const result = await submitTrackingByIdToken(idToken, orderNumber, value, db)
    setSubmittingTracking(null)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('追跡番号を登録しました')
    setTrackingInput((prev) => ({ ...prev, [orderNumber]: '' }))
    await loadOrders(idToken)
  }

  // --- 商品の追加（申込後に「あれも送ります」となったとき用） ---
  const [addOpenFor, setAddOpenFor] = useState<string | null>(null)
  const [addProducts, setAddProducts] = useState<AddableProduct[]>([])
  const [addLoading, setAddLoading] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [addCart, setAddCart] = useState<Record<string, number>>({})
  const [submittingAdd, setSubmittingAdd] = useState(false)

  async function toggleAddPanel(orderNumber: string, db?: string) {
    if (addOpenFor === orderNumber) {
      setAddOpenFor(null)
      return
    }
    if (!idToken) return
    setAddOpenFor(orderNumber)
    setAddCart({})
    setAddSearch('')
    setAddProducts([])
    setAddLoading(true)
    const result = await getMyOrderAddableProducts(idToken, orderNumber, db)
    setAddLoading(false)
    if ('error' in result && result.error) {
      toast.error(result.error)
      setAddOpenFor(null)
      return
    }
    if ('products' in result && result.products) setAddProducts(result.products)
  }

  function changeAddQty(productId: string, delta: number) {
    setAddCart((prev) => {
      const next = { ...prev }
      const qty = (next[productId] ?? 0) + delta
      // PSA10は1枚までのため、画面側でも1で止める（最終判定はサーバー側）
      const isPsa10 = addProducts.find((p) => p.id === productId)?.subcategory_name === 'PSA10'
      if (isPsa10 && qty > 1) {
        toast.info('PSA10商品はお一人様1枚までです')
        return prev
      }
      if (qty <= 0) delete next[productId]
      else next[productId] = qty
      return next
    })
  }

  async function handleAddItems(orderNumber: string, db?: string) {
    if (!idToken) return
    const items = Object.entries(addCart).map(([product_id, quantity]) => ({ product_id, quantity }))
    if (items.length === 0) return
    setSubmittingAdd(true)
    const result = await addMyOrderItems(idToken, orderNumber, items, db)
    setSubmittingAdd(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('商品を追加しました')
    setAddOpenFor(null)
    setAddCart({})
    await loadOrders(idToken)
  }

  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null)
  async function handleDownloadPdf(orderNumber: string, db?: string) {
    if (!idToken) return
    setDownloadingPdf(orderNumber)
    const result = await createMyInspectionPdfLink(idToken, orderNumber, db)
    setDownloadingPdf(null)
    if ('error' in result && result.error) {
      toast.error(result.error)
      return
    }
    if (!('path' in result) || !result.path) return

    // blob URL + window.open はLINEアプリ内ブラウザで開けず、
    // サーバー応答を待ってからのwindow.openはポップアップとしても弾かれるため、
    // 署名付きの実URLへ遷移させる。LINE内ではopenExternalBrowser=1で外部ブラウザに渡す。
    const inLine = /Line\//i.test(navigator.userAgent)
    const url = `${window.location.origin}${result.path}${inLine ? '&openExternalBrowser=1' : ''}`
    window.location.href = url
  }

  return (
    <div className="min-h-screen bg-muted/50">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-1 text-xl font-bold">お申込み状況</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          あなたのお申込みと進捗をご確認いただけます
        </p>

        {loading ? (
          // 読み込み中は注文カードと同じ形のスケルトンを表示（体感速度の改善）
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Card key={i}>
                <CardContent className="animate-pulse space-y-3 py-4">
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-28 rounded bg-gray-200" />
                    <div className="h-5 w-20 rounded-full bg-gray-200" />
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-gray-200" />
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-24 rounded bg-gray-200" />
                    <div className="h-4 w-32 rounded bg-gray-200" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !inLine ? (
          <Card>
            <CardContent className="space-y-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                このページは公式LINEのメニューから開いてください。
              </p>
              <Link href="/tracking">
                <Button variant="outline">注文番号で確認する</Button>
              </Link>
            </CardContent>
          </Card>
        ) : orders.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              お申込みはまだありません。
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => {
              const s = CUSTOMER_STATUS[o.status] ?? { label: o.status, color: 'bg-gray-100 text-gray-700', step: 0 }
              const amount = (o.inspected_total_amount ?? o.total_amount) - (o.inspection_discount ?? 0)
              return (
                <Card key={`${o._db ?? 't'}-${o.order_number}`}>
                  <CardContent className="space-y-2 py-4">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-mono text-sm">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        {o.order_number.replace(/^BB-\d{8}-/, 'BB-')}
                      </span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.color}`}>
                        {s.label}
                      </span>
                    </div>

                    {/* 進捗バー */}
                    {s.step > 0 && (
                      <div className="flex items-center gap-1 pt-1">
                        {['受付', '発送', '検品', '振込'].map((label, i) => {
                          const reached = s.step >= i + 2
                          return (
                            <div key={label} className="flex-1 text-center">
                              <div className={`h-1.5 rounded-full ${reached ? 'bg-orange-500' : 'bg-gray-200'}`} />
                              <span className={`mt-0.5 block text-[10px] ${reached ? 'text-orange-600' : 'text-gray-400'}`}>
                                {label}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 text-sm">
                      <span className="text-muted-foreground">
                        {new Date(o.created_at).toLocaleDateString('ja-JP')} 申込
                      </span>
                      <span className="font-medium">
                        {s.step >= 4 ? 'お振込金額' : '申込金額'} {amount.toLocaleString()}円
                      </span>
                    </div>

                    {/* 検品完了以降は査定結果PDFをダウンロード可能 */}
                    {['検品完了', '振込済', '振込確認済'].includes(o.status) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => handleDownloadPdf(o.order_number, o._db)}
                        disabled={downloadingPdf === o.order_number}
                      >
                        <FileDown className="mr-1.5 h-4 w-4" />
                        {downloadingPdf === o.order_number ? '準備中...' : '査定結果をダウンロード'}
                      </Button>
                    )}

                    {/* 発送待ち（追跡番号未登録）の注文には入力欄を表示 */}
                    {o.status === '申込' && !o.tracking_number && (
                      <div className="space-y-1.5 rounded-md bg-muted/50 p-2">
                        <p className="text-xs text-muted-foreground">
                          商品を発送したら、追跡番号（お問い合わせ番号）をご登録ください
                        </p>
                        <div className="flex gap-2">
                          <Input
                            value={trackingInput[o.order_number] ?? ''}
                            onChange={(e) =>
                              setTrackingInput((prev) => ({ ...prev, [o.order_number]: e.target.value }))
                            }
                            placeholder="追跡番号を入力"
                            className="h-9 bg-white text-sm"
                          />
                          <Button
                            size="sm"
                            onClick={() => handleSubmitTracking(o.order_number, o._db)}
                            disabled={submittingTracking === o.order_number || !(trackingInput[o.order_number] ?? '').trim()}
                          >
                            {submittingTracking === o.order_number ? '登録中...' : '登録'}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* 検品前の注文は、あとから商品を追加できる */}
                    {ADDABLE_STATUSES.includes(o.status) && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => toggleAddPanel(o.order_number, o._db)}
                        >
                          {addOpenFor === o.order_number ? (
                            <><X className="mr-1.5 h-4 w-4" />追加をやめる</>
                          ) : (
                            <><Plus className="mr-1.5 h-4 w-4" />商品を追加する</>
                          )}
                        </Button>

                        {addOpenFor === o.order_number && (
                          <div className="space-y-2 rounded-md bg-muted/50 p-2">
                            <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                              <p className="font-bold">⚠ 追加の際は必ずLINEでご連絡ください</p>
                              <p className="mt-1">
                                ご連絡がない場合、商品が到着しても買取できかねることがございます。
                              </p>
                              <p className="mt-1">
                                追加する商品は<strong>本日の買取価格</strong>でのお申込みとなります。
                              </p>
                            </div>
                            {addLoading ? (
                              <p className="py-4 text-center text-sm text-muted-foreground">読み込み中...</p>
                            ) : addProducts.length === 0 ? (
                              <p className="py-4 text-center text-sm text-muted-foreground">
                                ただいま受付中の商品がありません
                              </p>
                            ) : (
                              <>
                                <div className="relative">
                                  <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                  <Input
                                    value={addSearch}
                                    onChange={(e) => setAddSearch(e.target.value)}
                                    placeholder="商品名で検索..."
                                    className="h-9 bg-white pl-8 text-sm"
                                  />
                                </div>
                                <div className="max-h-64 space-y-1 overflow-y-auto">
                                  {addProducts
                                    .filter((p) => !addSearch || p.name.toLowerCase().includes(addSearch.toLowerCase()))
                                    .slice(0, 80)
                                    .map((p) => (
                                      <div
                                        key={p.id}
                                        className="flex items-center gap-2 rounded border bg-white px-2 py-1.5"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <p className="truncate text-xs font-medium">{p.name}</p>
                                          <p className="text-xs text-muted-foreground">
                                            {p.price.toLocaleString()}円
                                          </p>
                                        </div>
                                        {addCart[p.id] ? (
                                          <div className="flex shrink-0 items-center gap-1">
                                            <Button
                                              variant="outline"
                                              size="icon"
                                              className="h-7 w-7"
                                              onClick={() => changeAddQty(p.id, -1)}
                                            >
                                              <Minus className="h-3 w-3" />
                                            </Button>
                                            <span className="w-6 text-center text-sm">{addCart[p.id]}</span>
                                            <Button
                                              variant="outline"
                                              size="icon"
                                              className="h-7 w-7"
                                              disabled={p.subcategory_name === 'PSA10'}
                                              onClick={() => changeAddQty(p.id, 1)}
                                            >
                                              <Plus className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        ) : (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 shrink-0"
                                            onClick={() => changeAddQty(p.id, 1)}
                                          >
                                            追加
                                          </Button>
                                        )}
                                      </div>
                                    ))}
                                </div>
                                {Object.keys(addCart).length > 0 && (
                                  <div className="space-y-1.5 border-t pt-2">
                                    <p className="text-sm font-medium">
                                      追加分の合計{' '}
                                      {Object.entries(addCart)
                                        .reduce((sum, [id, qty]) => sum + (addProducts.find((p) => p.id === id)?.price ?? 0) * qty, 0)
                                        .toLocaleString()}
                                      円
                                    </p>
                                    <p className="text-xs text-amber-900">
                                      追加後、<strong>LINEでのご連絡をお願いします</strong>
                                    </p>
                                    <Button
                                      className="w-full"
                                      size="sm"
                                      disabled={submittingAdd}
                                      onClick={() => handleAddItems(o.order_number, o._db)}
                                    >
                                      {submittingAdd ? '追加中...' : 'この内容で追加する'}
                                    </Button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}
