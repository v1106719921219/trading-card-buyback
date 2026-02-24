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
import { ArrowLeft, ClipboardCheck, Clock, MapPin, Truck, ShieldCheck, ExternalLink } from 'lucide-react'
import { addTrackingNumber } from '@/actions/orders'
import { createClient } from '@/lib/supabase/client'
import { STATUS_TRANSITIONS, STATUS_COLORS } from '@/lib/constants'
import { toast } from 'sonner'
import type { Order, OrderItem, OrderStatusHistory, OrderStatus, Office } from '@/types/database'

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

  const supabase = createClient()

  async function fetchOrder() {
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

    // Fetch office if order has office_id
    if (orderData.office_id) {
      const { data: officeData } = await supabase
        .from('offices')
        .select('*')
        .eq('id', orderData.office_id)
        .single()
      if (officeData) setOffice(officeData as Office)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchOrder()
  }, [orderId])

  async function handleStatusChange() {
    if (!newStatus || !order) return

    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)

    if (error) {
      toast.error(`ステータス変更に失敗しました: ${error.message}`)
      return
    }

    toast.success(`ステータスを「${newStatus}」に変更しました`)
    setNewStatus('')
    fetchOrder()
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

  if (loading || !order) {
    return <div className="p-8 text-center text-muted-foreground">読み込み中...</div>
  }

  const allowedTransitions = STATUS_TRANSITIONS[order.status as OrderStatus] || []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/orders">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
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
              <Badge className={`text-sm px-3 py-1 ${STATUS_COLORS[order.status as OrderStatus]}`}>
                {order.status}
              </Badge>
            </div>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order items */}
          <Card>
            <CardHeader>
              <CardTitle>注文明細</CardTitle>
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
                      <TableCell className="text-right">{item.quantity}</TableCell>
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
                    <TableRow>
                      <TableCell colSpan={3 + (items.some((i) => i.inspected_quantity != null) ? 1 : 0) + (items.some((i) => (i.returned_quantity ?? 0) > 0) ? 1 : 0)} className="text-right text-sm text-muted-foreground">
                        減額
                      </TableCell>
                      <TableCell className="text-right text-sm text-destructive">
                        -{order.inspection_discount.toLocaleString()}円
                      </TableCell>
                    </TableRow>
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
                <dd>{order.customer_not_invoice_issuer ? '該当しない' : '未確認'}</dd>
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
          {office && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  発送先事務所
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-[120px_1fr] gap-3 text-sm">
                  <dt className="text-muted-foreground">事務所名</dt>
                  <dd>{office.name}</dd>
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
              </CardContent>
            </Card>
          )}
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
                    <Button className="w-full" disabled={!newStatus}>
                      ステータスを変更
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
        </div>
      </div>

    </div>
  )
}
