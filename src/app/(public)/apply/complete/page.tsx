'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CheckCircle, Minus, Package, Plus, Search, Trash2, Truck } from 'lucide-react'
import { Footer } from '@/components/public/footer'
import { Header } from '@/components/public/header'
import { getOfficeById } from '@/actions/offices'
import {
  getOrderByOrderNumber,
  getOrderWithItems,
  submitTrackingNumber,
  addTrackingNumber,
  updateOrderItems,
} from '@/actions/orders'
import { getActiveProducts } from '@/actions/products'
import type { Office, OrderItem, Product } from '@/types/database'

interface EditableItem {
  product_id: string
  product_name: string
  unit_price: number
  quantity: number
}

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

  // Order items state
  const [orderItems, setOrderItems] = useState<EditableItem[]>([])
  const [originalItems, setOriginalItems] = useState<EditableItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [saveError, setSaveError] = useState('')

  // Product selection dialog
  const [showProductDialog, setShowProductDialog] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [productSearch, setProductSearch] = useState('')

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

  // Fetch order items
  useEffect(() => {
    if (orderNumber) {
      setItemsLoading(true)
      getOrderWithItems(orderNumber).then((order) => {
        if (order?.order_items) {
          const items: EditableItem[] = order.order_items.map((item: OrderItem) => ({
            product_id: item.product_id || '',
            product_name: item.product_name,
            unit_price: item.unit_price,
            quantity: item.quantity,
          }))
          setOrderItems(items)
          setOriginalItems(items)
        }
        setItemsLoading(false)
      })
    }
  }, [orderNumber])

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

    const updated = existingTrackingNumber
      ? `${existingTrackingNumber}\n${trackingNumber.trim()}`
      : trackingNumber.trim()
    setExistingTrackingNumber(updated)
    setTrackingNumber('')
  }

  // Order items editing
  const isEditable = orderStatus === '申込'

  const totalAmount = orderItems.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0
  )

  const hasChanges = JSON.stringify(orderItems) !== JSON.stringify(originalItems)

  const updateQuantity = useCallback((index: number, delta: number) => {
    setOrderItems((prev) => {
      const next = [...prev]
      const newQty = next[index].quantity + delta
      if (newQty < 1) return prev
      if (newQty > 999) return prev
      next[index] = { ...next[index], quantity: newQty }
      return next
    })
  }, [])

  const removeItem = useCallback((index: number) => {
    setOrderItems((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const addProduct = useCallback((product: Product) => {
    setOrderItems((prev) => {
      const existing = prev.findIndex((item) => item.product_id === product.id)
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = { ...next[existing], quantity: next[existing].quantity + 1 }
        return next
      }
      return [
        ...prev,
        {
          product_id: product.id,
          product_name: product.name,
          unit_price: product.price,
          quantity: 1,
        },
      ]
    })
    setShowProductDialog(false)
    setProductSearch('')
  }, [])

  async function handleOpenProductDialog() {
    setShowProductDialog(true)
    if (products.length === 0) {
      setProductsLoading(true)
      try {
        const data = await getActiveProducts()
        setProducts(data)
      } catch {
        // ignore
      }
      setProductsLoading(false)
    }
  }

  async function handleSaveItems() {
    if (!orderNumber || orderItems.length === 0) return
    setSaving(true)
    setSaveMessage('')
    setSaveError('')

    const result = await updateOrderItems(orderNumber, orderItems)

    setSaving(false)

    if (result.error) {
      setSaveError(result.error)
      return
    }

    setOriginalItems([...orderItems])
    setSaveMessage('変更を保存しました')
    setTimeout(() => setSaveMessage(''), 3000)
  }

  const filteredProducts = productSearch
    ? products.filter((p) =>
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        (p.category?.name && p.category.name.toLowerCase().includes(productSearch.toLowerCase()))
      )
    : products

  const isFirstTracking = orderStatus === '申込' && trackingNumbers.length === 0
  const showTrackingForm = isFirstTracking || (orderStatus === '発送済')
  const showTrackingInfo = trackingNumbers.length > 0

  return (
    <div className="min-h-screen bg-muted/50 flex flex-col">
      <Header />
      <div className="flex-1 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg space-y-4">
        <Card className="text-center">
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
                {isFirstTracking && (
                  <p className="text-xs text-muted-foreground text-center">
                    複数の荷物がある場合は、登録後に追加で入力できます
                  </p>
                )}
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
                      <p>買取スクエア 宛</p>
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

        {/* Order Items Section */}
        {!itemsLoading && orderItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                申込商品一覧
                {isEditable && (
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    （編集可能）
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {orderItems.map((item, index) => (
                <div
                  key={`${item.product_id}-${index}`}
                  className="flex items-center justify-between gap-2 py-2 border-b last:border-b-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      ¥{item.unit_price.toLocaleString()} × {item.quantity}点
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {isEditable ? (
                      <>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 sm:h-7 sm:w-7"
                          onClick={() => updateQuantity(index, -1)}
                          disabled={item.quantity <= 1}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center text-sm font-medium">
                          {item.quantity}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 sm:h-7 sm:w-7"
                          onClick={() => updateQuantity(index, 1)}
                          disabled={item.quantity >= 999}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 sm:h-7 sm:w-7 text-destructive hover:text-destructive"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-sm font-medium">
                        ¥{(item.unit_price * item.quantity).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              <div className="flex justify-between pt-2 border-t font-medium">
                <span>合計見積額</span>
                <span>¥{totalAmount.toLocaleString()}</span>
              </div>

              {isEditable && (
                <div className="space-y-2 pt-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleOpenProductDialog}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    商品を追加
                  </Button>

                  {saveError && (
                    <p className="text-sm text-destructive text-center">{saveError}</p>
                  )}
                  {saveMessage && (
                    <p className="text-sm text-green-600 text-center">{saveMessage}</p>
                  )}

                  <Button
                    className="w-full"
                    disabled={saving || !hasChanges || orderItems.length === 0}
                    onClick={handleSaveItems}
                  >
                    {saving ? '保存中...' : '変更を保存'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Read-only items for non-editable status with no items loaded yet handled */}
        {!itemsLoading && orderItems.length === 0 && !isEditable && orderStatus && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">申込商品一覧</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">商品情報がありません</p>
            </CardContent>
          </Card>
        )}

        {/* Product Selection Dialog */}
        <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
          <DialogContent className="max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>商品を追加</DialogTitle>
            </DialogHeader>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="商品名で検索..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex-1 overflow-y-auto max-h-[50vh] space-y-1">
              {productsLoading ? (
                <p className="text-sm text-muted-foreground text-center py-4">読み込み中...</p>
              ) : filteredProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">商品が見つかりません</p>
              ) : (
                filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-muted transition-colors"
                    onClick={() => addProduct(product)}
                  >
                    <p className="text-sm font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {product.category?.name && `${product.category.name} · `}
                      ¥{product.price.toLocaleString()}
                    </p>
                  </button>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
      </div>

      <Footer />
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
