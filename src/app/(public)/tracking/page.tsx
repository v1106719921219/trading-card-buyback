'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Truck } from 'lucide-react'
import { Header } from '@/components/public/header'
import { Footer } from '@/components/public/footer'
import { getOrderByOrderNumber } from '@/actions/orders'

export default function TrackingPage() {
  const router = useRouter()
  const [orderNumber, setOrderNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = orderNumber.trim()
    if (!trimmed) return

    setLoading(true)
    setError('')

    const order = await getOrderByOrderNumber(trimmed)

    if (!order) {
      setError('注文番号が見つかりません。メールに記載の注文番号をご確認ください。')
      setLoading(false)
      return
    }

    router.push(`/apply/complete?order_number=${encodeURIComponent(trimmed)}`)
  }

  return (
    <div className="min-h-screen bg-muted/50 flex flex-col">
      <Header />
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <Truck className="h-12 w-12 text-primary" />
              </div>
              <CardTitle className="text-xl">追跡番号の入力</CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                申込時にお送りしたメールに記載の注文番号を入力してください
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="order_number">注文番号</Label>
                  <Input
                    id="order_number"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="例: BB-20260310-001"
                    className="text-center font-mono text-lg h-12"
                  />
                </div>
                {error && (
                  <p className="text-sm text-destructive text-center">{error}</p>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={loading || !orderNumber.trim()}
                >
                  {loading ? '検索中...' : '追跡番号を入力する'}
                </Button>
              </form>
              <div className="mt-6 text-center">
                <Link href="/">
                  <Button variant="ghost" size="sm">
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    トップに戻る
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <Footer />
    </div>
  )
}
