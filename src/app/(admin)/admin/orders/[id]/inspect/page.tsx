'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AdminHeader } from '@/components/admin/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import type { Order, OrderItem, Product, Category } from '@/types/database'

interface InspectItem {
  id: string
  product_id: string | null
  product_name: string
  unit_price: number
  quantity: number
  _inspected: number
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
  const [products, setProducts] = useState<(Product & { category: Category })[]>([])

  const supabase = createClient()

  async function fetchOrder() {
    const [orderResult, productResult] = await Promise.all([
      supabase
        .from('orders')
        .select('*, order_items(*)')
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

    setOrder(orderResult.data as Order)
    setItems(
      ((orderResult.data as Order).order_items || []).map((item) => ({
        id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        unit_price: item.unit_price,
        quantity: item.quantity,
        _inspected: item.inspected_quantity ?? item.quantity,
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

  function updateItem(id: string, field: '_inspected' | '_inspected_price' | '_returned', value: number) {
    setItems(items.map((item) =>
      item.id === id ? { ...item, [field]: Math.max(0, value) } : item
    ))
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

  function removeNewItem(id: string) {
    setItems(items.filter((item) => item.id !== id))
  }

  const originalTotal = items
    .filter((i) => !i._isNew)
    .reduce((sum, item) => sum + item.unit_price * item.quantity, 0)

  const inspectedTotal = items.reduce(
    (sum, item) => sum + item._inspected_price * (item._inspected - item._returned), 0
  )
  const difference = inspectedTotal - originalTotal

  async function handleSave() {
    // Validate new items
    for (const item of items) {
      if (item._isNew && (!item.product_name || item._inspected_price <= 0)) {
        toast.error('追加商品の商品名と単価を入力してください')
        return
      }
    }

    setSaving(true)

    // Update existing items
    for (const item of items) {
      if (item._isNew) continue
      const { error } = await supabase
        .from('order_items')
        .update({
          inspected_quantity: item._inspected,
          unit_price: item._inspected_price,
          returned_quantity: item._returned,
        })
        .eq('id', item.id)

      if (error) {
        toast.error(`検品数量の更新に失敗しました: ${error.message}`)
        setSaving(false)
        return
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
      }))

      const { error } = await supabase.from('order_items').insert(inserts)
      if (error) {
        toast.error(`追加商品の保存に失敗しました: ${error.message}`)
        setSaving(false)
        return
      }
    }

    // Update order's inspected_total_amount and return_status
    const hasReturns = items.some((item) => item._returned > 0)
    const { error } = await supabase
      .from('orders')
      .update({
        inspected_total_amount: inspectedTotal,
        return_status: hasReturns ? '返送待ち' : null,
      })
      .eq('id', orderId)

    if (error) {
      toast.error('検品合計の更新に失敗しました')
      setSaving(false)
      return
    }

    toast.success('検品結果を保存しました')
    setSaving(false)
    // Re-fetch to get inserted items with proper IDs
    fetchOrder()
  }

  async function handleComplete() {
    await handleSave()

    const { error } = await supabase
      .from('orders')
      .update({ status: '検品完了' })
      .eq('id', orderId)

    if (error) {
      toast.error('ステータスの変更に失敗しました')
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
          const subtotal = item._inspected_price * (item._inspected - item._returned)
          return (
            <Card key={item.id}>
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
                        申告: {item.unit_price.toLocaleString()}円 x {item.quantity}個
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold">{subtotal.toLocaleString()}円</p>
                    <p className="text-xs text-muted-foreground">検品後小計</p>
                  </div>
                  {item._isNew && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => removeNewItem(item.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>

                {/* Input fields - grid layout for touch */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">検品単価</Label>
                    <Input
                      type="number"
                      value={item._inspected_price}
                      onChange={(e) =>
                        updateItem(item.id, '_inspected_price', Number(e.target.value))
                      }
                      className="text-right h-12 text-base"
                      min={0}
                      step={100}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">検品数量</Label>
                    <Input
                      type="number"
                      value={item._inspected}
                      onChange={(e) =>
                        updateItem(item.id, '_inspected', Number(e.target.value))
                      }
                      className="text-right h-12 text-base"
                      min={0}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">返品数量</Label>
                    <Input
                      type="number"
                      value={item._returned}
                      onChange={(e) =>
                        updateItem(item.id, '_returned', Number(e.target.value))
                      }
                      className="text-right h-12 text-base"
                      min={0}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Summary */}
      <div className="grid gap-4 grid-cols-3">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs sm:text-sm text-muted-foreground">申告合計</p>
            <p className="text-lg sm:text-2xl font-bold">{originalTotal.toLocaleString()}円</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs sm:text-sm text-muted-foreground">検品後合計</p>
            <p className="text-lg sm:text-2xl font-bold">{inspectedTotal.toLocaleString()}円</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs sm:text-sm text-muted-foreground">差額</p>
            <p className={`text-lg sm:text-2xl font-bold ${difference < 0 ? 'text-destructive' : difference > 0 ? 'text-green-600' : ''}`}>
              {difference > 0 ? '+' : ''}{difference.toLocaleString()}円
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Actions - sticky bottom for iPad */}
      <div className="sticky bottom-0 bg-background border-t py-4 -mx-4 px-4 md:-mx-8 md:px-8 flex justify-end gap-3">
        <Button variant="outline" size="lg" onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          一時保存
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="lg">検品完了にする</Button>
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
