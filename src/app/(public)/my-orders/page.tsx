'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Header } from '@/components/public/header'
import { Footer } from '@/components/public/footer'
import { Package, FileDown } from 'lucide-react'
import { toast } from 'sonner'
import { initLiff } from '@/lib/liff-client'
import { getMyOrdersByIdToken, submitTrackingByIdToken, getMyInspectionPdf } from '@/actions/orders'

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

  async function handleSubmitTracking(orderNumber: string) {
    const value = (trackingInput[orderNumber] ?? '').trim()
    if (!value || !idToken) return
    setSubmittingTracking(orderNumber)
    const result = await submitTrackingByIdToken(idToken, orderNumber, value)
    setSubmittingTracking(null)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('追跡番号を登録しました')
    setTrackingInput((prev) => ({ ...prev, [orderNumber]: '' }))
    await loadOrders(idToken)
  }

  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null)
  async function handleDownloadPdf(orderNumber: string) {
    if (!idToken) return
    setDownloadingPdf(orderNumber)
    const result = await getMyInspectionPdf(idToken, orderNumber)
    setDownloadingPdf(null)
    if ('error' in result && result.error) {
      toast.error(result.error)
      return
    }
    if ('data' in result && result.data) {
      // base64 → Blob → 新しいタブで開く（LINEアプリ内ブラウザで表示・保存できる）
      const bytes = Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    }
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
                <Card key={o.order_number}>
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
                        onClick={() => handleDownloadPdf(o.order_number)}
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
                            onClick={() => handleSubmitTracking(o.order_number)}
                            disabled={submittingTracking === o.order_number || !(trackingInput[o.order_number] ?? '').trim()}
                          >
                            {submittingTracking === o.order_number ? '登録中...' : '登録'}
                          </Button>
                        </div>
                      </div>
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
