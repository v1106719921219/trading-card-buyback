'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AdminHeader } from '@/components/admin/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { notifyDiscordInspectionIssue } from '@/lib/discord'
import type { Order, OrderItem, Product, Category, InspectionStatus } from '@/types/database'
import { INSPECTION_STATUSES } from '@/lib/constants'

interface InspectItem {
  id: string
  product_id: string | null
  product_name: string
  unit_price: number
  quantity: number
  _inspected: number | null  // null = 未入力
  _inspected_price: number
  _returned: number
  _isNew: boolean
}

export default function InspectPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.id as string

  const [order, setOrder] = useState<Order | null>(null)
  const [items, setItems] = useState<InspectItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [discount, setDiscount] = useState(0)
  const [inspectionNotes, setInspectionNotes] = useState('')
  const [products, setProducts] = useState<(Product & { category: Category })[]>([])
  const [inspectionStatus, setInspectionStatus] = useState<InspectionStatus | ''>('')
  const [arrivalDate, setArrivalDate] = useState('')

  const isChiba = (process.env.NEXT_PUBLIC_SITE_URL ?? '').includes('chiba')
  const supabase = createClient()

  async function fetchOrder() {
    const [orderResult, productResult] = await Promise.all([
      supabase
        .from('orders')
        .select('*, order_items(*), office:offices(name)')
        .eq('id', orderId)
        .single(),
      supabase
        .from('products')
        .select('*, category:categories(*)')
        .eq('is_active', true)
        .order('name'),
    ])

    if (orderResult.error || !orderResult.data) {
      toast.error('注文が見つかりません')
      router.push('/admin/orders')
      return
    }

    if (orderResult.data.status !== '発送済') {
      toast.error('発送済の注文のみ検品入力ができます')
      router.push(`/admin/orders/${orderId}`)
      return
    }

    const orderData = orderResult.data as Order
    setOrder(orderData)
    setDiscount(orderData.inspection_discount ?? 0)
    setInspectionNotes(orderData.inspection_notes ?? '')
    setInspectionStatus(orderData.inspection_status ?? '')
    setArrivalDate(orderData.arrival_date ?? '')
    setItems(
      ((orderResult.data as Order).order_items || []).map((item) => ({
        id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        unit_price: item.unit_price,
        quantity: item.quantity,
        _inspected: item.inspected_quantity ?? null,
        _inspected_price: item.unit_price,
        _returned: item.returned_quantity ?? 0,
        _isNew: false,
      }))
    )
    if (productResult.data) {
      const sorted = [...productResult.data].sort((a: any, b: any) => {
        const catA = a.category?.sort_order ?? 0
        const catB = b.category?.sort_order ?? 0
        if (catA !== catB) return catA - catB
        return (a.sort_order ?? 0) - (b.sort_order ?? 0)
      })
      setProducts(sorted as (Product & { category: Category })[])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchOrder()
  }, [orderId])

  function updateItem(id: string, field: '_inspected_price' | '_returned', value: number) {
    setItems(items.map((item) =>
      item.id === id ? { ...item, [field]: Math.max(0, value) } : item
    ))
  }

  function updateInspected(id: string, raw: string) {
    setItems(items.map((item) => {
      if (item.id !== id) return item
      if (raw === '') return { ...item, _inspected: null }
      const val = parseInt(raw, 10)
      return { ...item, _inspected: isNaN(val) ? null : Math.max(0, val) }
    }))
  }

  function addItem() {
    const newId = `new_${Date.now()}`
    setItems([...items, {
      id: newId,
      product_id: null,
      product_name: '',
      unit_price: 0,
      quantity: 0,
      _inspected: 1,
      _inspected_price: 0,
      _returned: 0,
      _isNew: true,
    }])
  }

  function selectProduct(itemId: string, productId: string) {
    const product = products.find((p) => p.id === productId)
    if (!product) return
    setItems(items.map((item) =>
      item.id === itemId
        ? { ...item, product_id: productId, product_name: product.name, _inspected_price: product.price }
        : item
    ))
  }

  async function removeItem(id: string, isNew: boolean) {
    if (!isNew) {
      const { error } = await supabase.from('order_items').delete().eq('id', id)
      if (error) {
        toast.error(`商品の削除に失敗しました: ${error.message}`)
        return
      }
    }
    setItems(items.filter((item) => item.id !== id))
  }

  const originalTotal = items
    .filter((i) => !i._isNew)
    .reduce((sum, item) => sum + item.unit_price * item.quantity, 0)

  const inspectedSubtotal = items.reduce(
    (sum, item) => sum + item._inspected_price * ((item._inspected ?? 0) - item._returned), 0
  )

  // 既存商品（_isNew=false）が全て入力済みかどうか
  const allInspected = items.filter((i) => !i._isNew).every((i) => i._inspected !== null)
  const inspectedTotal = inspectedSubtotal - discount
  const difference = inspectedTotal - originalTotal

  async function handleSave(): Promise<boolean> {
    // Validate: 既存商品の検品数量が全て入力済みか
    const uninspected = items.filter((i) => !i._isNew && i._inspected === null)
    if (uninspected.length > 0) {
      toast.error(`${uninspected.length}件の商品の検品数量が未入力です`)
      return false
    }
    // Validate new items
    for (const item of items) {
      if (item._isNew && (!item.product_name || item._inspected_price <= 0)) {
        toast.error('追加商品の商品名と単価を入力してください')
        return false
      }
    }

    setSaving(true)

    // Update existing items
    for (const item of items) {
      if (item._isNew) continue
      const { error } = await supabase
        .from('order_items')
        .update({
          inspected_quantity: item._inspected ?? 0,
          unit_price: item._inspected_price,
          returned_quantity: item._returned,
        })
        .eq('id', item.id)

      if (error) {
        toast.error(`検品数量の更新に失敗しました: ${error.message}`)
        setSaving(false)
        return false
      }
    }

    // Insert new items
    const newItems = items.filter((i) => i._isNew)
    if (newItems.length > 0) {
      const inserts = newItems.map((item) => ({
        order_id: orderId,
        product_id: item.product_id,
        product_name: item.product_name,
        unit_price: item._inspected_price,
        quantity: 0,
        inspected_quantity: item._inspected,
        returned_quantity: item._returned,
        tenant_id: order?.tenant_id,
      }))

      const { error } = await supabase.from('order_items').insert(inserts)
      if (error) {
        toast.error(`追加商品の保存に失敗しました: ${error.message}`)
        setSaving(false)
        return false
      }
    }

    // Update order's inspected_total_amount, discount, notes, and return_status
    // inspected_total_amount は減額前の小計を保存（表示時に inspection_discount を引く）
    const hasReturns = items.some((item) => item._returned > 0)
    const { error } = await supabase
      .from('orders')
      .update({
        inspected_total_amount: inspectedSubtotal,
        inspection_discount: discount,
        inspection_notes: inspectionNotes || null,
        inspection_status: inspectionStatus || null,
        return_status: hasReturns ? '返送待ち' : null,
        ...(isChiba ? { arrival_date: arrivalDate || null } : {}),
      })
      .eq('id', orderId)

    if (error) {
      toast.error(`検品合計の更新に失敗しました: ${error.message}`)
      setSaving(false)
      return false
    }

    toast.success('検品結果を保存しました')
    setSaving(false)

    // 問題ありステータスに初めて変更されたときだけDiscordに通知（既に問題ありなら通知しない）
    if (inspectionStatus === '問題あり' && order && order.inspection_status !== '問題あり') {
      const result = await notifyDiscordInspectionIssue({
        orderId,
        orderNumber: order.order_number,
        customerName: order.customer_name,
        notes: inspectionNotes,
        totalAmount: inspectedTotal,
        officeKey: order.office?.name ?? undefined,
      })
      if (result.success) {
        toast.info('Discordに検品問題を通知しました 📸')
      } else {
        toast.error(`Discord通知失敗: ${result.error}`)
      }
    }

    // Re-fetch to get inserted items with proper IDs
    fetchOrder()
    return true
  }

  async function handleComplete() {
    const saved = await handleSave()
    if (saved === false) return

    const { error } = await supabase
      .from('orders')
      .update({ status: '検品完了', inspection_status: null })
      .eq('id', orderId)

    if (error) {
      toast.error(`ステータスの変更に失敗しました: ${error.message}`)
      return
    }

    toast.success('検品が完了しました')
    router.push(`/admin/orders/${orderId}`)
  }

  if (loading || !order) {
    return <div className="p-8 text-center text-muted-foreground">読み込み中...</div>
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href={`/admin/orders/${orderId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <AdminHeader
          title={`検品 - ${order.order_number.replace(/^BB-\d{8}-/, 'BB-')}`}
          description={`${order.customer_name} 様`}
        />
      </div>

      {/* Item cards */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">商品一覧（{items.length}件）</h3>
        <Button variant="outline" size="sm" onClick={addItem}>
          <Plus className="mr-1 h-4 w-4" />
          商品追加
        </Button>
      </div>

      <div className="space-y-4">
        {items.map((item, index) => {
          const subtotal = item._inspected_price * ((item._inspected ?? 0) - item._returned)
          const isMismatch = !item._isNew && item._inspected !== null && item._inspected !== item.quantity
          const isUnfilled = !item._isNew && item._inspected === null
          return (
            <Card key={item.id} className={isMismatch ? 'border-red-400' : isUnfilled ? 'border-amber-400' : ''}>
              <CardContent className="pt-5 pb-4 space-y-4">
                {/* Product name */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {item._isNew ? (
                      <Select onValueChange={(v) => selectProduct(item.id, v)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="商品を選択" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="font-medium text-base">{item.product_name}</p>
                    )}
                    {item._isNew && (
                      <Badge variant="outline" className="mt-1">追加</Badge>
                    )}
                    {!item._isNew && (
                      <p className="text-sm text-muted-foreground mt-0.5">
                        単価: {item.unit_price.toLocaleString()}円
                        {order.buyback_type === 'ar_quality' && ` × ${item.quantity}個`}
                      </p>
                    )}
                    {isMismatch && (
                      <p className="text-xs text-red-600 font-medium mt-0.5">
                        ⚠ 申告数量（{item.quantity}個）と異なります
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold">{item._inspected !== null ? subtotal.toLocaleString() : '-'}円</p>
                    <p className="text-xs text-muted-foreground">検品後小計</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => removeItem(item.id, item._isNew)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>

                {/* Input fields - grid layout for touch */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">検品単価</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={item._inspected_price || ''}
                      onChange={(e) =>
                        updateItem(item.id, '_inspected_price', Number(e.target.value))
                      }
                      onFocus={(e) => e.target.select()}
                      className="text-right h-12 text-base"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className={`text-xs mb-1 block font-medium ${isUnfilled ? 'text-amber-600' : isMismatch ? 'text-red-600' : 'text-muted-foreground'}`}>
                      検品数量{isUnfilled && ' ※要入力'}
                    </Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={item._inspected === null ? '' : String(item._inspected)}
                      onChange={(e) => updateInspected(item.id, e.target.value)}
                      onFocus={(e) => e.target.select()}
                      className={`text-right h-12 text-base ${isUnfilled ? 'border-amber-400 bg-amber-50' : isMismatch ? 'border-red-400 bg-red-50' : ''}`}
                      placeholder="未入力"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">返品数量</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={item._returned || ''}
                      onChange={(e) =>
                        updateItem(item.id, '_returned', Number(e.target.value))
                      }
                      onFocus={(e) => e.target.select()}
                      className="text-right h-12 text-base"
                      placeholder="0"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Inspection Status, Discount & Notes */}
      <div className={`grid gap-4 grid-cols-1 ${isChiba ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
        <div>
          <Label className="text-sm font-medium mb-1 block">検品進捗</Label>
          <Select
            value={inspectionStatus}
            onValueChange={(v) => setInspectionStatus(v === 'none' ? '' : v as InspectionStatus)}
          >
            <SelectTrigger className="h-12 text-base">
              <SelectValue placeholder="未設定" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">未設定</SelectItem>
              {INSPECTION_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">一時保存時に記録されます</p>
        </div>
        <div>
          <Label className="text-sm font-medium mb-1 block">減額</Label>
          <Input
            type="number"
            value={discount || ''}
            onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
            onFocus={(e) => e.target.select()}
            className="h-12 text-base text-right"
            min={0}
            step={100}
            placeholder="0"
          />
          <p className="text-xs text-muted-foreground mt-1">検品後合計から差し引かれます</p>
        </div>
        <div>
          <Label className="text-sm font-medium mb-1 block">検品メモ</Label>
          <Textarea
            value={inspectionNotes}
            onChange={(e) => setInspectionNotes(e.target.value)}
            className="min-h-[48px] text-base resize-none"
            placeholder="減額理由など..."
            rows={2}
          />
        </div>
        {isChiba && (
          <div>
            <Label className="text-sm font-medium mb-1 block">到着日</Label>
            <Input
              type="date"
              value={arrivalDate}
              onChange={(e) => setArrivalDate(e.target.value)}
              className="h-12 text-base"
            />
            <p className="text-xs text-muted-foreground mt-1">荷物の到着日を記録</p>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs sm:text-sm text-muted-foreground">申告合計</p>
            <p className="text-lg sm:text-2xl font-bold">{originalTotal.toLocaleString()}円</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs sm:text-sm text-muted-foreground">検品小計</p>
            <p className="text-lg sm:text-2xl font-bold">{inspectedSubtotal.toLocaleString()}円</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs sm:text-sm text-muted-foreground">減額</p>
            <p className="text-lg sm:text-2xl font-bold text-destructive">
              {discount > 0 ? `-${discount.toLocaleString()}` : '0'}円
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs sm:text-sm text-muted-foreground">検品後合計</p>
            <p className={`text-lg sm:text-2xl font-bold ${difference < 0 ? 'text-destructive' : ''}`}>
              {inspectedTotal.toLocaleString()}円
            </p>
            {difference !== 0 && (
              <p className={`text-xs ${difference < 0 ? 'text-destructive' : 'text-green-600'}`}>
                申告比 {difference > 0 ? '+' : ''}{difference.toLocaleString()}円
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actions - sticky bottom for iPad */}
      <div className="sticky bottom-0 bg-background border-t py-4 -mx-4 px-4 md:-mx-8 md:px-8 flex items-center justify-end gap-3">
        {!allInspected && (
          <p className="text-sm text-amber-600 mr-auto">
            {items.filter((i) => !i._isNew && i._inspected === null).length}件の検品数量が未入力です
          </p>
        )}
        <Button variant="outline" size="lg" onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          一時保存
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="lg" disabled={!allInspected}>検品完了にする</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>検品を完了しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                検品後合計: {inspectedTotal.toLocaleString()}円
                {difference !== 0 && ` （申告比: ${difference > 0 ? '+' : ''}${difference.toLocaleString()}円）`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction onClick={handleComplete}>
                検品完了
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
