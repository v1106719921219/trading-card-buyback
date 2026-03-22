'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AdminHeader } from '@/components/admin/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { ArrowLeft, ClipboardCheck, Clock, MapPin, Truck, ShieldCheck, ExternalLink, FileDown, Trash2, AlertTriangle, Pencil, Plus } from 'lucide-react'
import { addTrackingNumber, deleteOrder, updateOrderItemQuantities, updateBuybackType, updateOrderOffice, addOrderItem } from '@/actions/orders'
import { downloadInspectionPdf } from '@/actions/payments'
import { createClient } from '@/lib/supabase/client'
import { STATUS_TRANSITIONS, STATUS_COLORS, BUYBACK_TYPE_LABELS, BUYBACK_TYPE_COLORS, INSPECTION_STATUS_COLORS } from '@/lib/constants'
import { toast } from 'sonner'
import type { Order, OrderItem, OrderStatusHistory, OrderStatus, Office, UserRole, BuybackType, InspectionStatus, Product } from '@/types/database'

export default function OrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.id as string

  const [order, setOrder] = useState<Order | null>(null)
  const [items, setItems] = useState<OrderItem[]>([])
  const [history, setHistory] = useState<OrderStatusHistory[]>([])
  const [office, setOffice] = useState<Office | null>(null)
  const [loading, setLoading] = useState(true)
  const [newStatus, setNewStatus] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [newTrackingNumber, setNewTrackingNumber] = useState('')
  const [addingTracking, setAddingTracking] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [duplicateOrders, setDuplicateOrders] = useState<{ id: string; order_number: string; status: string; created_at: string; total_amount: number }[]>([])
  const [editingQuantities, setEditingQuantities] = useState(false)
  const [editItems, setEditItems] = useState<{ id: string; quantity: number }[]>([])
  const [savingQuantities, setSavingQuantities] = useState(false)
  const [savingBuybackType, setSavingBuybackType] = useState(false)
  const [offices, setOffices] = useState<Office[]>([])
  const [savingOffice, setSavingOffice] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [addingItem, setAddingItem] = useState(false)
  const [newItemProductId, setNewItemProductId] = useState('')
  const [newItemQuantity, setNewItemQuantity] = useState(1)
  const [savingNewItem, setSavingNewItem] = useState(false)

  const supabase = createClient()

  async function fetchOrder() {
    // ユーザーロール取得
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (profile) setUserRole(profile.role as UserRole)
    }

    const [orderResult, historyResult] = await Promise.all([
      supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', orderId)
        .single(),
      supabase
        .from('order_status_history')
        .select('*')
        .eq('order_id', orderId)
        .order('changed_at', { ascending: true }),
    ])

    if (orderResult.error || !orderResult.data) {
      toast.error('注文が見つかりません')
      router.push('/admin/orders')
      return
    }

    const orderData = orderResult.data as Order
    setOrder(orderData)
    setItems(orderData.order_items || [])
    setNotes(orderResult.data.notes || '')
    setHistory((historyResult.data || []) as OrderStatusHistory[])

    // 重複注文チェック: 同じ顧客名＋同じ合計金額の別注文を検索
    const { data: dupes } = await supabase
      .from('orders')
      .select('id, order_number, status, created_at, total_amount')
      .eq('customer_name', orderData.customer_name)
      .eq('total_amount', orderData.total_amount)
      .neq('id', orderId)
      .order('created_at', { ascending: false })
      .limit(10)
    setDuplicateOrders(dupes || [])

    // 商品マスタ取得（申込・発送済ステータス時に商品追加で使用）
    const { data: productData } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('name')
    if (productData) setProducts(productData as Product[])

    // Fetch offices list and current office
    const { data: allOffices } = await supabase
      .from('offices')
      .select('*')
      .eq('is_active', true)
      .order('name')
    if (allOffices) setOffices(allOffices as Office[])

    if (orderData.office_id) {
      const currentOffice = (allOffices || []).find((o: Office) => o.id === orderData.office_id)
      if (currentOffice) setOffice(currentOffice as Office)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchOrder()
  }, [orderId])

  async function handleStatusChange() {
    if (!newStatus || !order || changingStatus) return
    setChangingStatus(true)

    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)

    setChangingStatus(false)
    if (error) {
      toast.error(`ステータス変更に失敗しました: ${error.message}`)
      return
    }

    toast.success(`ステータスを「${newStatus}」に変更しました`)
    setNewStatus('')
    fetchOrder()
  }

  async function handleDelete() {
    if (!order || deleting) return
    setDeleting(true)
    const result = await deleteOrder(orderId)
    if (result.error) {
      toast.error(result.error)
      setDeleting(false)
      return
    }
    toast.success('注文を削除しました')
    router.push('/admin/orders')
  }

  async function handleSaveNotes() {
    setSavingNotes(true)
    const { error } = await supabase
      .from('orders')
      .update({ notes })
      .eq('id', orderId)

    setSavingNotes(false)
    if (error) {
      toast.error('メモの保存に失敗しました')
      return
    }
    toast.success('メモを保存しました')
  }

  async function handleAddTrackingNumber() {
    if (!order || !newTrackingNumber.trim()) return
    setAddingTracking(true)
    const result = await addTrackingNumber(order.order_number, newTrackingNumber.trim())
    setAddingTracking(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('追跡番号を追加しました')
    setNewTrackingNumber('')
    fetchOrder()
  }

  async function handleDownloadPdf() {
    const result = await downloadInspectionPdf(orderId)
    if (result.error || !result.data) {
      toast.error(result.error ?? 'PDF生成に失敗しました')
      return
    }
    const byteArray = Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0))
    const blob = new Blob([byteArray], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = result.filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleStartEditQuantities() {
    setEditItems(items.map((item) => ({ id: item.id, quantity: item.quantity })))
    setEditingQuantities(true)
  }

  function handleCancelEditQuantities() {
    setEditingQuantities(false)
    setEditItems([])
  }

  async function handleSaveQuantities() {
    setSavingQuantities(true)
    const result = await updateOrderItemQuantities(orderId, editItems)
    setSavingQuantities(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('申告数量を更新しました')
    setEditingQuantities(false)
    setEditItems([])
    fetchOrder()
  }

  async function handleAddItem() {
    if (!newItemProductId || newItemQuantity <= 0) return
    const product = products.find((p) => p.id === newItemProductId)
    if (!product) return
    setSavingNewItem(true)
    const result = await addOrderItem(orderId, {
      product_id: product.id,
      product_name: product.name,
      unit_price: product.price,
      quantity: newItemQuantity,
    })
    setSavingNewItem(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('商品を追加しました')
    setAddingItem(false)
    setNewItemProductId('')
    setNewItemQuantity(1)
    fetchOrder()
  }

  async function handleOfficeChange(value: string) {
    setSavingOffice(true)
    const result = await updateOrderOffice(orderId, value)
    setSavingOffice(false)
    if (result.error) {
      toast.error(`事務所の変更に失敗しました: ${result.error}`)
      return
    }
    toast.success('到着事務所を変更しました')
    fetchOrder()
  }

  async function handleBuybackTypeChange(value: string) {
    setSavingBuybackType(true)
    const buybackType = value === 'none' ? null : (value as BuybackType)
    const result = await updateBuybackType(orderId, buybackType)
    setSavingBuybackType(false)
    if (result.error) {
      toast.error(`買取種別の変更に失敗しました: ${result.error}`)
      return
    }
    toast.success('買取種別を変更しました')
    fetchOrder()
  }

  if (loading || !order) {
    return <div className="p-8 text-center text-muted-foreground">読み込み中...</div>
  }

  const allowedTransitions = STATUS_TRANSITIONS[order.status as OrderStatus] || []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <AdminHeader
          title={order.order_number}
          actions={
            <div className="flex items-center gap-2">
              {order.status === '発送済' && (
                <Link href={`/admin/orders/${orderId}/inspect`}>
                  <Button variant="outline">
                    <ClipboardCheck className="mr-2 h-4 w-4" />
                    検品入力
                  </Button>
                </Link>
              )}
              {(['検品完了', '振込済'] as OrderStatus[]).includes(order.status as OrderStatus) && (
                <Link href={`/admin/orders/${orderId}/verify`}>
                  <Button variant="outline">
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    検品確認
                  </Button>
                </Link>
              )}
              {(['検品完了', '振込済', '振込確認済'] as OrderStatus[]).includes(order.status as OrderStatus) && (
                <Button variant="outline" onClick={handleDownloadPdf}>
                  <FileDown className="mr-2 h-4 w-4" />
                  査定結果PDF
                </Button>
              )}
              {order.buyback_type && (
                <Badge className={`text-sm px-3 py-1 ${BUYBACK_TYPE_COLORS[order.buyback_type]}`}>
                  {BUYBACK_TYPE_LABELS[order.buyback_type]}
                </Badge>
              )}
              <Badge className={`text-sm px-3 py-1 ${STATUS_COLORS[order.status as OrderStatus]}`}>
                {order.status}
              </Badge>
              {order.inspection_status && (
                <Badge className={`text-sm px-3 py-1 ${INSPECTION_STATUS_COLORS[order.inspection_status as InspectionStatus]}`}>
                  {order.inspection_status}
                </Badge>
              )}
            </div>
          }
        />
      </div>

      {/* 重複注文アラート */}
      {duplicateOrders.length > 0 && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 shrink-0" />
            <div className="space-y-2">
              <p className="font-medium text-orange-800">
                重複の可能性がある注文が {duplicateOrders.length} 件あります
              </p>
              <p className="text-sm text-orange-700">
                同じ顧客名・同じ合計金額の注文です。重複振込にご注意ください。
              </p>
              <div className="flex flex-wrap gap-2">
                {duplicateOrders.map((d) => (
                  <Link
                    key={d.id}
                    href={`/admin/orders/${d.id}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-orange-300 bg-white px-3 py-1.5 text-sm font-medium text-orange-800 hover:bg-orange-100 transition-colors"
                  >
                    {d.order_number}
                    <Badge variant="outline" className="text-xs">
                      {d.status}
                    </Badge>
                    <span className="text-xs text-orange-600">
                      ({new Date(d.created_at).toLocaleDateString('ja-JP')})
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order items */}
          <Card>
            <CardHeader>
              <CardTitle>注文明細</CardTitle>
              {!editingQuantities && !addingItem && (() => {
                const postInspectionStatuses: OrderStatus[] = ['検品完了', '振込済', '振込確認済']
                const isPostInspection = postInspectionStatuses.includes(order.status as OrderStatus)
                const canEdit = !isPostInspection || (userRole && ['admin', 'manager'].includes(userRole))
                const canAddItem = (['申込', '発送済'] as OrderStatus[]).includes(order.status as OrderStatus)
                return (
                  <div data-slot="card-action" className="flex gap-2">
                    {canAddItem && (
                      <Button variant="outline" size="sm" onClick={() => setAddingItem(true)}>
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        商品追加
                      </Button>
                    )}
                    {canEdit && (
                      <Button variant="outline" size="sm" onClick={handleStartEditQuantities}>
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        編集
                      </Button>
                    )}
                  </div>
                )
              })()}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>商品名</TableHead>
                    <TableHead className="text-right">単価</TableHead>
                    <TableHead className="text-right">申告数量</TableHead>
                    {items.some((i) => i.inspected_quantity != null) && (
                      <TableHead className="text-right">検品数量</TableHead>
                    )}
                    {items.some((i) => (i.returned_quantity ?? 0) > 0) && (
                      <TableHead className="text-right">返品数量</TableHead>
                    )}
                    <TableHead className="text-right">小計</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.product_name}</TableCell>
                      <TableCell className="text-right">
                        {item.unit_price.toLocaleString()}円
                      </TableCell>
                      <TableCell className="text-right">
                        {editingQuantities ? (
                          <Input
                            type="number"
                            min={0}
                            className="w-20 ml-auto text-right"
                            value={editItems.find((e) => e.id === item.id)?.quantity ?? item.quantity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10)
                              setEditItems((prev) =>
                                prev.map((ei) =>
                                  ei.id === item.id ? { ...ei, quantity: isNaN(val) ? 0 : val } : ei
                                )
                              )
                            }}
                          />
                        ) : (
                          item.quantity
                        )}
                      </TableCell>
                      {items.some((i) => i.inspected_quantity != null) && (
                        <TableCell className="text-right">
                          {item.inspected_quantity != null ? (
                            <span className={item.inspected_quantity !== item.quantity ? 'text-destructive font-medium' : ''}>
                              {item.inspected_quantity}
                            </span>
                          ) : '-'}
                        </TableCell>
                      )}
                      {items.some((i) => (i.returned_quantity ?? 0) > 0) && (
                        <TableCell className="text-right">
                          {(item.returned_quantity ?? 0) > 0 ? (
                            <span className="text-destructive font-medium">
                              {item.returned_quantity}
                            </span>
                          ) : '-'}
                        </TableCell>
                      )}
                      <TableCell className="text-right font-medium">
                        {(item.unit_price * ((item.inspected_quantity ?? item.quantity) - (item.returned_quantity ?? 0))).toLocaleString()}円
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3 + (items.some((i) => i.inspected_quantity != null) ? 1 : 0) + (items.some((i) => (i.returned_quantity ?? 0) > 0) ? 1 : 0)} className="text-right font-bold">
                      合計
                    </TableCell>
                    <TableCell className="text-right font-bold text-lg">
                      {(order.inspected_total_amount ?? order.total_amount).toLocaleString()}円
                    </TableCell>
                  </TableRow>
                  {order.inspection_discount > 0 && (
                    <>
                      <TableRow>
                        <TableCell colSpan={3 + (items.some((i) => i.inspected_quantity != null) ? 1 : 0) + (items.some((i) => (i.returned_quantity ?? 0) > 0) ? 1 : 0)} className="text-right text-sm text-muted-foreground">
                          減額
                        </TableCell>
                        <TableCell className="text-right text-sm text-destructive">
                          -{order.inspection_discount.toLocaleString()}円
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={3 + (items.some((i) => i.inspected_quantity != null) ? 1 : 0) + (items.some((i) => (i.returned_quantity ?? 0) > 0) ? 1 : 0)} className="text-right font-bold">
                          振込金額
                        </TableCell>
                        <TableCell className="text-right font-bold text-lg">
                          {((order.inspected_total_amount ?? order.total_amount) - order.inspection_discount).toLocaleString()}円
                        </TableCell>
                      </TableRow>
                    </>
                  )}
                  {order.inspected_total_amount != null && order.inspected_total_amount !== order.total_amount && (
                    <TableRow>
                      <TableCell colSpan={3 + (items.some((i) => i.inspected_quantity != null) ? 1 : 0) + (items.some((i) => (i.returned_quantity ?? 0) > 0) ? 1 : 0)} className="text-right text-sm text-muted-foreground">
                        申告時合計
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground line-through">
                        {order.total_amount.toLocaleString()}円
                      </TableCell>
                    </TableRow>
                  )}
                  {order.inspection_notes && (
                    <TableRow>
                      <TableCell colSpan={4 + (items.some((i) => i.inspected_quantity != null) ? 1 : 0) + (items.some((i) => (i.returned_quantity ?? 0) > 0) ? 1 : 0)} className="text-sm text-muted-foreground">
                        検品メモ: {order.inspection_notes}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {editingQuantities && (
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={handleCancelEditQuantities} disabled={savingQuantities}>
                    キャンセル
                  </Button>
                  <Button onClick={handleSaveQuantities} disabled={savingQuantities}>
                    {savingQuantities ? '保存中...' : '保存'}
                  </Button>
                </div>
              )}
              {addingItem && (
                <div className="mt-4 rounded-lg border p-4 space-y-3">
                  <p className="text-sm font-medium">商品を追加</p>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Select value={newItemProductId} onValueChange={setNewItemProductId}>
                        <SelectTrigger>
                          <SelectValue placeholder="商品を選択" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}（{p.price.toLocaleString()}円）
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-24">
                      <Input
                        type="text"
                        inputMode="numeric"
                        min={1}
                        value={newItemQuantity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10)
                          setNewItemQuantity(isNaN(val) ? 1 : Math.max(1, val))
                        }}
                        onFocus={(e) => e.target.select()}
                        placeholder="数量"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setAddingItem(false); setNewItemProductId(''); setNewItemQuantity(1) }}
                      disabled={savingNewItem}
                    >
                      キャンセル
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAddItem}
                      disabled={savingNewItem || !newItemProductId}
                    >
                      {savingNewItem ? '追加中...' : '追加'}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Customer info */}
          <Card>
            <CardHeader>
              <CardTitle>お客様情報</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[120px_1fr] gap-3 text-sm">
                <dt className="text-muted-foreground">お名前</dt>
                <dd>{order.customer_name}</dd>
                {order.customer_line_name && (
                  <>
                    <dt className="text-muted-foreground">LINE登録名</dt>
                    <dd>{order.customer_line_name}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">メール</dt>
                <dd>{order.customer_email}</dd>
                {order.customer_phone && (
                  <>
                    <dt className="text-muted-foreground">電話番号</dt>
                    <dd>{order.customer_phone}</dd>
                  </>
                )}
                {order.customer_birth_date && (
                  <>
                    <dt className="text-muted-foreground">生年月日</dt>
                    <dd>{order.customer_birth_date}</dd>
                  </>
                )}
                {order.customer_occupation && (
                  <>
                    <dt className="text-muted-foreground">職業</dt>
                    <dd>{order.customer_occupation}</dd>
                  </>
                )}
                {order.customer_prefecture && (
                  <>
                    <dt className="text-muted-foreground">都道府県</dt>
                    <dd>{order.customer_prefecture}</dd>
                  </>
                )}
                {order.customer_address && (
                  <>
                    <dt className="text-muted-foreground">住所</dt>
                    <dd>{order.customer_address}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">適格請求書発行</dt>
                <dd>
                  {order.customer_not_invoice_issuer ? 'なし' : 'あり'}
                  {order.invoice_issuer_number && (
                    <span className="ml-1 font-mono text-xs">({order.invoice_issuer_number})</span>
                  )}
                </dd>
                {order.customer_identity_method && (
                  <>
                    <dt className="text-muted-foreground">本人確認方法</dt>
                    <dd>{order.customer_identity_method}</dd>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>

          {/* Bank info */}
          <Card>
            <CardHeader>
              <CardTitle>振込先口座</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[120px_1fr] gap-3 text-sm">
                <dt className="text-muted-foreground">銀行名</dt>
                <dd>{order.bank_name}</dd>
                <dt className="text-muted-foreground">支店名</dt>
                <dd>{order.bank_branch}</dd>
                <dt className="text-muted-foreground">口座種別</dt>
                <dd>{order.bank_account_type}</dd>
                <dt className="text-muted-foreground">口座番号</dt>
                <dd>{order.bank_account_number}</dd>
                <dt className="text-muted-foreground">口座名義</dt>
                <dd>{order.bank_account_holder}</dd>
              </dl>
            </CardContent>
          </Card>

          {/* Tracking number */}
          {(order.tracking_number || order.status !== '申込') && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  追跡番号
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {order.tracking_number && (
                  <div className="space-y-2">
                    {order.tracking_number.split('\n').filter(Boolean).map((tn, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <p className="font-mono text-lg">{tn}</p>
                        <a
                          href={`https://member.kms.kuronekoyamato.co.jp/parcel/detail?pno=${tn}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          ヤマト追跡
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
                {order.status !== '申込' && (
                  <div className="flex gap-2">
                    <Input
                      value={newTrackingNumber}
                      onChange={(e) => setNewTrackingNumber(e.target.value)}
                      placeholder="追跡番号を追加"
                      className="flex-1"
                    />
                    <Button
                      onClick={handleAddTrackingNumber}
                      disabled={addingTracking || !newTrackingNumber.trim()}
                      size="sm"
                    >
                      {addingTracking ? '追加中...' : '追加'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Shipping office */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                宛先
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {offices.length > 1 && (
                <Select
                  value={order.office_id || ''}
                  onValueChange={handleOfficeChange}
                  disabled={savingOffice}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="事務所を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {offices.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {office && (
                <dl className="grid grid-cols-[120px_1fr] gap-3 text-sm">
                  <dt className="text-muted-foreground">宛名</dt>
                  <dd>買取スクエア</dd>
                  <dt className="text-muted-foreground">郵便番号</dt>
                  <dd>〒{office.postal_code}</dd>
                  <dt className="text-muted-foreground">住所</dt>
                  <dd>{office.address}</dd>
                  {office.phone && (
                    <>
                      <dt className="text-muted-foreground">電話番号</dt>
                      <dd>{office.phone}</dd>
                    </>
                  )}
                </dl>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status change */}
          {allowedTransitions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>ステータス変更</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="変更先を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedTransitions.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button className="w-full" disabled={!newStatus || changingStatus}>
                      {changingStatus ? '変更中...' : 'ステータスを変更'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>ステータスを変更しますか？</AlertDialogTitle>
                      <AlertDialogDescription>
                        「{order.status}」から「{newStatus}」に変更します。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>キャンセル</AlertDialogCancel>
                      <AlertDialogAction onClick={handleStatusChange}>
                        変更する
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          )}

          {/* 買取種別 */}
          <Card>
            <CardHeader>
              <CardTitle>買取種別</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={order.buyback_type ?? 'none'}
                onValueChange={handleBuybackTypeChange}
                disabled={savingBuybackType}
              >
                <SelectTrigger>
                  <SelectValue placeholder="未設定" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未設定</SelectItem>
                  <SelectItem value="ar_quality">AR美品</SelectItem>
                  <SelectItem value="minimum_guarantee">最低保証</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle>メモ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="内部メモを入力..."
                rows={4}
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={handleSaveNotes}
                disabled={savingNotes}
              >
                {savingNotes ? '保存中...' : 'メモを保存'}
              </Button>
            </CardContent>
          </Card>

          {/* Status history */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                ステータス履歴
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">履歴がありません</p>
              ) : (
                <div className="space-y-3">
                  {history.map((h) => (
                    <div key={h.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                        <div className="w-0.5 flex-1 bg-border" />
                      </div>
                      <div className="pb-3">
                        <div className="flex items-center gap-2">
                          {h.old_status && (
                            <>
                              <Badge variant="outline" className="text-xs">{h.old_status}</Badge>
                              <span className="text-xs">→</span>
                            </>
                          )}
                          <Badge className={`text-xs ${STATUS_COLORS[h.new_status as OrderStatus]}`}>
                            {h.new_status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(h.changed_at).toLocaleString('ja-JP')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 削除ボタン（admin/managerのみ） */}
          {userRole && ['admin', 'manager'].includes(userRole) && (
            <Card className="border-destructive/50">
              <CardContent className="pt-6">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full" disabled={deleting}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      {deleting ? '削除中...' : 'この注文を削除'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>注文を削除しますか？</AlertDialogTitle>
                      <AlertDialogDescription>
                        注文「{order.order_number}」を完全に削除します。この操作は取り消せません。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>キャンセル</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        削除する
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

    </div>
  )
}
