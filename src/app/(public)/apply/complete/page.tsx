'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle, Package, Truck } from 'lucide-react'
import { getOfficeById } from '@/actions/offices'
import { getOrderByOrderNumber, submitTrackingNumber, addTrackingNumber } from '@/actions/orders'
import type { Office } from '@/types/database'

function CompleteContent() {
  const searchParams = useSearchParams()
  const orderNumber = searchParams.get('order_number')
  const officeId = searchParams.get('office_id')
  const [office, setOffice] = useState<Office | null>(null)
  const [trackingNumber, setTrackingNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [orderStatus, setOrderStatus] = useState<string | null>(null)
  const [existingTrackingNumber, setExistingTrackingNumber] = useState<string | null>(null)

  useEffect(() => {
    if (officeId) {
      getOfficeById(officeId).then((data) => {
        if (data) setOffice(data)
      })
    }
  }, [officeId])

  useEffect(() => {
    if (orderNumber) {
      getOrderByOrderNumber(orderNumber).then((order) => {
        if (order) {
          setOrderStatus(order.status)
          setExistingTrackingNumber(order.tracking_number)
          if (!officeId && order.office_id) {
            getOfficeById(order.office_id).then((data) => {
              if (data) setOffice(data)
            })
          }
        }
      })
    }
  }, [orderNumber, officeId])

  const trackingNumbers = existingTrackingNumber
    ? existingTrackingNumber.split('\n').filter(Boolean)
    : []

  async function handleSubmitTracking(e: React.FormEvent) {
    e.preventDefault()
    if (!orderNumber || !trackingNumber.trim()) return

    setSubmitting(true)
    setError('')

    const isFirst = orderStatus === '申込' && trackingNumbers.length === 0
    const result = isFirst
      ? await submitTrackingNumber(orderNumber, trackingNumber.trim())
      : await addTrackingNumber(orderNumber, trackingNumber.trim())

    setSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    if (isFirst) {
      setSubmitted(true)
      setOrderStatus('発送済')
    }

    // Append new tracking number to existing
    const updated = existingTrackingNumber
      ? `${existingTrackingNumber}\n${trackingNumber.trim()}`
      : trackingNumber.trim()
    setExistingTrackingNumber(updated)
    setTrackingNumber('')
  }

  const isFirstTracking = orderStatus === '申込' && trackingNumbers.length === 0
  const showTrackingForm = isFirstTracking || (orderStatus === '発送済')
  const showTrackingInfo = trackingNumbers.length > 0

  return (
    <div className="min-h-screen bg-muted/50 flex items-center justify-center px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <CheckCircle className="h-16 w-16 text-green-500" />
          </div>
          <CardTitle className="text-2xl">
            {submitted ? '追跡番号を登録しました' : '申込が完了しました'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {orderNumber && (
            <div className="bg-muted p-4 rounded-md">
              <p className="text-sm text-muted-foreground mb-1">注文番号</p>
              <p className="text-2xl font-bold font-mono">{orderNumber}</p>
            </div>
          )}

          {submitted && (
            <div className="bg-green-50 border border-green-200 p-4 rounded-md">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Truck className="h-5 w-5 text-green-600" />
                <p className="font-medium text-green-800">発送済みとして登録されました</p>
              </div>
            </div>
          )}

          {showTrackingInfo && (
            <div className="bg-muted p-4 rounded-md">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Package className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">登録済み追跡番号</p>
              </div>
              <ul className="space-y-1">
                {trackingNumbers.map((tn, i) => (
                  <li key={i} className="font-bold font-mono">{tn}</li>
                ))}
              </ul>
            </div>
          )}

          {showTrackingForm && (
            <form onSubmit={handleSubmitTracking} className="space-y-3 text-left">
              <div className="space-y-2">
                <Label htmlFor="tracking_number">追跡番号</Label>
                <Input
                  id="tracking_number"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="追跡番号を入力してください"
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={submitting || !trackingNumber.trim()}>
                {submitting
                  ? '送信中...'
                  : isFirstTracking
                    ? '追跡番号を登録して発送済みにする'
                    : '追跡番号を追加する'}
              </Button>
            </form>
          )}

          {!submitted && (
            <>
              <p className="text-sm text-muted-foreground">
                商品を下記住所までお送りください。到着後、検品を行い、結果をメールにてお知らせいたします。
              </p>
              <div className="bg-muted p-4 rounded-md text-sm text-left">
                <p className="font-medium mb-1">送付先</p>
                {office ? (
                  <>
                    <p>〒{office.postal_code}</p>
                    <p>{office.address}</p>
                    <p>{office.name} 宛</p>
                    {office.phone && <p>TEL: {office.phone}</p>}
                  </>
                ) : (
                  <p className="text-muted-foreground">読み込み中...</p>
                )}
              </div>
            </>
          )}

          <Link href="/">
            <Button variant="outline" className="w-full mt-4">
              トップページに戻る
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

export default function CompletePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">読み込み中...</div>}>
      <CompleteContent />
    </Suspense>
  )
}
