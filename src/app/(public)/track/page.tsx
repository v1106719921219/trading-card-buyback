'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Header } from '@/components/public/header'
import { Footer } from '@/components/public/footer'
import { Package, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { initLiff } from '@/lib/liff-client'
import { getMyOrdersByIdToken, submitTrackingByIdToken } from '@/actions/orders'

interface MyOrder {
  order_number: string
  status: string
  tracking_number: string | null
  created_at: string
  _db?: string
}

export default function TrackPage() {
  const [loading, setLoading] = useState(true)
  const [inLine, setInLine] = useState(true)
  const [idToken, setIdToken] = useState<string | null>(null)
  // 発送待ち（申込ステータス・追跡番号未登録）の注文だけを対象にする
  const [pending, setPending] = useState<MyOrder[]>([])
  const [trackingInput, setTrackingInput] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)

  async function loadPending(token: string) {
    const data = (await getMyOrdersByIdToken(token)) as MyOrder[]
    setPending(data.filter((o) => o.status === '申込' && !o.tracking_number))
  }

  useEffect(() => {
    const u = new URLSearchParams(window.location.search).get('u')
    if (u) {
      setIdToken(u)
      loadPending(u).finally(() => setLoading(false))
      return
    }
    initLiff().then(async (state) => {
      if (!state.inLiff || !state.idToken) {
        setInLine(false)
        setLoading(false)
        return
      }
      setIdToken(state.idToken)
      await loadPending(state.idToken)
      setLoading(false)
    })
  }, [])

  async function handleSubmit(orderNumber: string, db?: string) {
    const value = (trackingInput[orderNumber] ?? '').trim()
    if (!value || !idToken) return
    setSubmitting(orderNumber)
    const result = await submitTrackingByIdToken(idToken, orderNumber, value, db)
    setSubmitting(null)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('追跡番号を登録しました')
    setTrackingInput((prev) => ({ ...prev, [orderNumber]: '' }))
    await loadPending(idToken)
  }

  return (
    <div className="min-h-screen bg-muted/50">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-1 text-xl font-bold">追跡番号のご登録</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          商品を発送されたら、お問い合わせ番号（追跡番号）をご登録ください。
        </p>

        {loading ? (
          <div className="space-y-3">
            {[0].map((i) => (
              <Card key={i}>
                <CardContent className="animate-pulse space-y-3 py-4">
                  <div className="h-4 w-40 rounded bg-gray-200" />
                  <div className="h-9 w-full rounded bg-gray-200" />
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
                <Button variant="outline">注文番号で登録する</Button>
              </Link>
            </CardContent>
          </Card>
        ) : pending.length === 0 ? (
          <Card>
            <CardContent className="space-y-3 py-8 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-green-500" />
              <p className="text-sm text-muted-foreground">
                現在、追跡番号のご登録が必要なお申込みはありません。
              </p>
              <Link href="/my-orders">
                <Button variant="outline">査定状況を見る</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {pending.map((o) => (
              <Card key={o.order_number}>
                <CardContent className="space-y-2 py-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-mono text-sm">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      {o.order_number.replace(/^BB-\d{8}-/, 'BB-')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleDateString('ja-JP')} 申込
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={trackingInput[o.order_number] ?? ''}
                      onChange={(e) =>
                        setTrackingInput((prev) => ({ ...prev, [o.order_number]: e.target.value }))
                      }
                      placeholder="追跡番号を入力"
                      className="h-10 bg-white text-sm"
                      inputMode="numeric"
                    />
                    <Button
                      onClick={() => handleSubmit(o.order_number, o._db)}
                      disabled={submitting === o.order_number || !(trackingInput[o.order_number] ?? '').trim()}
                    >
                      {submitting === o.order_number ? '登録中...' : '登録'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}
