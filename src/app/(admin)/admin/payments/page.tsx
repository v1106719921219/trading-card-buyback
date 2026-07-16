'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminHeader } from '@/components/admin/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
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
import { Badge } from '@/components/ui/badge'
import { CreditCard, Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { bulkMarkAsPaid } from '@/actions/payments'
import type { Order } from '@/types/database'

// 同一人物判定用のキー（メール / 銀行口座）
function personKeys(o: Pick<Order, 'customer_email' | 'bank_name' | 'bank_account_number'>): string[] {
  const keys: string[] = []
  if (o.customer_email) keys.push(`email:${o.customer_email.trim().toLowerCase()}`)
  if (o.bank_name && o.bank_account_number) keys.push(`bank:${o.bank_name}:${o.bank_account_number}`)
  return keys
}

interface RepeatWarning {
  orderNumber: string
  date: string
  amount: number
  kind: 'paid' | 'pending' // paid=直近振込済あり, pending=振込待ち内に同一人物
}

export default function PaymentsPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [shippedOrders, setShippedOrders] = useState<Order[]>([])
  const [repeatWarnings, setRepeatWarnings] = useState<Map<string, RepeatWarning[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [shippedLoading, setShippedLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [processing, setProcessing] = useState(false)

  const supabase = createClient()

  function sortByOrderNumber(orders: Order[]) {
    return [...orders].sort((a, b) => {
      const numA = parseInt(a.order_number.slice(-4), 10)
      const numB = parseInt(b.order_number.slice(-4), 10)
      return numA - numB
    })
  }

  async function fetchOrders() {
    setLoading(true)
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('status', '検品完了')

    if (error) {
      toast.error('データの取得に失敗しました')
      return
    }
    const sorted = sortByOrderNumber(data || [])
    setOrders(sorted)
    // DBに保存されたチェック状態を復元
    const checked = sorted.filter((o) => o.payment_checked).map((o) => o.id)
    setSelectedIds(new Set(checked))
    setLoading(false)
    checkRepeatTransfers(sorted)
  }

  // 二重振込防止: 同一人物（メール or 銀行口座）で「今日振込済」または「同じ金額（別日でも）」の
  // 注文を検出（直近60日）。振込待ち内の同一人物・同額の重複も検出
  async function checkRepeatTransfers(pendingOrders: Order[]) {
    const todayJst = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
    const toJstDate = (ts: string) => new Date(ts).toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 60)
    const { data: paidOrders } = await supabase
      .from('orders')
      .select('order_number, customer_email, bank_name, bank_account_number, total_amount, inspected_total_amount, inspection_discount, updated_at')
      .in('status', ['振込済', '振込確認済'])
      .gte('updated_at', cutoff.toISOString())

    // キー → 振込済注文リスト
    const paidByKey = new Map<string, RepeatWarning[]>()
    for (const p of paidOrders ?? []) {
      const w: RepeatWarning = {
        orderNumber: p.order_number,
        date: toJstDate(String(p.updated_at)),
        amount: (p.inspected_total_amount ?? p.total_amount) - (p.inspection_discount ?? 0),
        kind: 'paid',
      }
      for (const key of personKeys(p)) {
        const list = paidByKey.get(key) ?? []
        list.push(w)
        paidByKey.set(key, list)
      }
    }

    // キー → 振込待ち内の注文リスト（同一人物の複数申込検出用）
    const pendingByKey = new Map<string, Order[]>()
    for (const o of pendingOrders) {
      for (const key of personKeys(o)) {
        const list = pendingByKey.get(key) ?? []
        list.push(o)
        pendingByKey.set(key, list)
      }
    }

    const warnings = new Map<string, RepeatWarning[]>()
    for (const o of pendingOrders) {
      const myAmount = (o.inspected_total_amount ?? o.total_amount) - (o.inspection_discount ?? 0)
      const seen = new Set<string>()
      const list: RepeatWarning[] = []
      for (const key of personKeys(o)) {
        for (const w of paidByKey.get(key) ?? []) {
          if (seen.has(w.orderNumber)) continue
          // 今日振込済 or 同じ金額（別日でも）の場合のみ警告
          if (w.date !== todayJst && w.amount !== myAmount) continue
          seen.add(w.orderNumber)
          list.push(w)
        }
        for (const other of pendingByKey.get(key) ?? []) {
          if (other.id === o.id || seen.has(other.order_number)) continue
          const otherAmount = (other.inspected_total_amount ?? other.total_amount) - (other.inspection_discount ?? 0)
          // 振込待ち内は同じ金額の場合のみ警告（同一人物の複数注文自体は正常）
          if (otherAmount !== myAmount) continue
          seen.add(other.order_number)
          list.push({
            orderNumber: other.order_number,
            date: toJstDate(String(other.updated_at)),
            amount: otherAmount,
            kind: 'pending',
          })
        }
      }
      if (list.length > 0) warnings.set(o.id, list)
    }
    setRepeatWarnings(warnings)
  }

  async function fetchShippedOrders() {
    setShippedLoading(true)
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('status', '発送済')

    if (error) {
      toast.error('データの取得に失敗しました')
      return
    }
    setShippedOrders(sortByOrderNumber(data || []))
    setShippedLoading(false)
  }

  useEffect(() => {
    fetchOrders()
    fetchShippedOrders()
  }, [])

  async function toggleSelect(id: string) {
    const next = new Set(selectedIds)
    const newChecked = !next.has(id)
    if (newChecked) next.add(id)
    else next.delete(id)
    setSelectedIds(next)

    const { error } = await supabase
      .from('orders')
      .update({ payment_checked: newChecked })
      .eq('id', id)
    if (error) {
      toast.error('チェック状態の保存に失敗しました')
    }
  }

  async function toggleInvoiceIssuer(id: string, listType: 'pending' | 'shipped') {
    const list = listType === 'pending' ? orders : shippedOrders
    const setList = listType === 'pending' ? setOrders : setShippedOrders
    const order = list.find((o) => o.id === id)
    if (!order) return
    const newValue = !order.customer_not_invoice_issuer
    const { error } = await supabase
      .from('orders')
      .update({ customer_not_invoice_issuer: newValue })
      .eq('id', id)
    if (error) {
      toast.error('適格事業者の更新に失敗しました')
      return
    }
    setList(list.map((o) => o.id === id ? { ...o, customer_not_invoice_issuer: newValue } : o))
    toast.success(newValue ? '適格事業者を解除しました' : '適格事業者に設定しました')
  }

  async function toggleVerified(id: string, listType: 'pending' | 'shipped') {
    const list = listType === 'pending' ? orders : shippedOrders
    const setList = listType === 'pending' ? setOrders : setShippedOrders
    const order = list.find((o) => o.id === id)
    if (!order) return
    const newValue = !order.bank_verified
    // チェック時: どの段階で確認したかを記録（shipped=振込予定時、pending=振込待ち時）
    const newStage = newValue ? (listType === 'shipped' ? '発送済' as const : '検品完了' as const) : null
    const { error } = await supabase
      .from('orders')
      .update({ bank_verified: newValue, bank_verified_stage: newStage })
      .eq('id', id)
    if (error) {
      toast.error('口座確認の更新に失敗しました')
      return
    }
    setList(list.map((o) => o.id === id ? { ...o, bank_verified: newValue, bank_verified_stage: newStage } : o))
  }

  async function toggleAll() {
    const allSelected = selectedIds.size === orders.length
    const ids = orders.map((o) => o.id)

    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(ids))
    }

    const { error } = await supabase
      .from('orders')
      .update({ payment_checked: !allSelected })
      .in('id', ids)
    if (error) {
      toast.error('チェック状態の保存に失敗しました')
    }
  }

  async function handleBulkPaid() {
    setProcessing(true)
    const ids = Array.from(selectedIds)

    const result = await bulkMarkAsPaid(ids)

    if (result.error) {
      toast.error(result.error)
      setProcessing(false)
      fetchOrders()
      return
    }

    if ('warning' in result && result.warning) {
      toast.warning(`振込処理は完了しましたが、${result.warning}`)
    } else {
      toast.success(`${ids.length}件の振込を処理しました（お客様にメール通知済み）`)
    }
    setSelectedIds(new Set())
    setProcessing(false)
    fetchOrders()
  }

  const unverifiedSelected = [...selectedIds].filter((id) => {
    const order = orders.find((o) => o.id === id)
    return order && !order.bank_verified
  })

  const totalAmount = orders
    .filter((o) => selectedIds.has(o.id))
    .reduce((sum, o) => sum + (o.inspected_total_amount ?? o.total_amount) - (o.inspection_discount ?? 0), 0)

  const shippedTotalAmount = shippedOrders.reduce(
    (sum, o) => sum + o.total_amount, 0
  )

  return (
    <div className="space-y-6">
      <AdminHeader
        title="振込管理"
        description="振込処理と振込予定の確認"
      />

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            振込待ち（{orders.length}）
          </TabsTrigger>
          <TabsTrigger value="upcoming">
            振込予定（{shippedOrders.length}）
          </TabsTrigger>
        </TabsList>

        {/* 振込待ち（検品完了）タブ */}
        <TabsContent value="pending" className="space-y-6">
          {/* Summary */}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">振込待ち</p>
                <p className="text-2xl font-bold">{orders.length}件</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">選択中</p>
                <p className="text-2xl font-bold">{selectedIds.size}件</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">選択合計金額</p>
                <p className="text-2xl font-bold">{totalAmount.toLocaleString()}円</p>
              </CardContent>
            </Card>
          </div>

          {/* Actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button disabled={processing || unverifiedSelected.length > 0}>
                    <CreditCard className="mr-2 h-4 w-4" />
                    {selectedIds.size}件を振込済にする
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>振込処理を実行しますか？</AlertDialogTitle>
                    <AlertDialogDescription>
                      {selectedIds.size}件の注文（合計 {totalAmount.toLocaleString()}円）を「振込済」に変更します。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>キャンセル</AlertDialogCancel>
                    <AlertDialogAction onClick={handleBulkPaid}>
                      振込済にする
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              {unverifiedSelected.length > 0 && (
                <p className="text-sm text-destructive">
                  口座確認が未チェックの注文が{unverifiedSelected.length}件あります
                </p>
              )}
            </div>
          )}

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={orders.length > 0 && selectedIds.size === orders.length}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>注文番号</TableHead>
                  <TableHead>お客様名</TableHead>
                  <TableHead className="hidden md:table-cell">振込先</TableHead>
                  <TableHead className="w-20 text-center">口座確認</TableHead>
                  <TableHead className="text-right">振込金額</TableHead>
                  <TableHead className="hidden sm:table-cell">検品完了日</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      読み込み中...
                    </TableCell>
                  </TableRow>
                ) : orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      振込待ちの注文はありません
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(order.id)}
                          onCheckedChange={() => toggleSelect(order.id)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {order.order_number.replace(/^BB-\d{8}-/, 'BB-')}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          {order.customer_name}
                          <Badge
                            variant="secondary"
                            className={`cursor-pointer text-[10px] px-1.5 py-0 ${
                              !order.customer_not_invoice_issuer
                                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                            }`}
                            onClick={() => toggleInvoiceIssuer(order.id, 'pending')}
                            title="クリックで適格事業者の状態を切り替え"
                          >
                            {!order.customer_not_invoice_issuer ? '適格' : '非適格'}
                          </Badge>
                        </span>
                        {repeatWarnings.has(order.id) && (
                          <div className="mt-1 space-y-0.5">
                            {repeatWarnings.get(order.id)!.map((w) => (
                              <p key={w.orderNumber} className="text-xs text-red-600 font-medium">
                                ⚠ {w.kind === 'pending'
                                  ? '振込待ちに同一人物・同額'
                                  : w.date === new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
                                    ? '本日振込済あり'
                                    : '同額の振込済あり'}: {w.orderNumber.replace(/^BB-\d{8}-/, 'BB-')}（{w.date.slice(5)} / {w.amount.toLocaleString()}円）
                              </p>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm hidden md:table-cell">
                        {order.bank_name} {order.bank_branch}
                        <br />
                        <span className="text-muted-foreground">
                          {order.bank_account_type} {order.bank_account_number}
                          <br />
                          {order.bank_account_holder}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Checkbox
                            checked={order.bank_verified}
                            onCheckedChange={() => toggleVerified(order.id, 'pending')}
                          />
                          {order.bank_verified && order.bank_verified_stage === '発送済' && (
                            <>
                              <span className="text-[10px] text-green-600">予定時確認済</span>
                              <span className="text-[10px] text-red-600 font-medium">振込金額注意</span>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {((order.inspected_total_amount ?? order.total_amount) - (order.inspection_discount ?? 0)).toLocaleString()}円
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                        {new Date(order.updated_at).toLocaleDateString('ja-JP')}
                      </TableCell>
                      <TableCell>
                        <Link href={`/admin/orders/${order.id}`}>
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* 振込予定（発送済）タブ */}
        <TabsContent value="upcoming" className="space-y-6">
          <div className="grid gap-4 grid-cols-2">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">発送済（検品待ち）</p>
                <p className="text-2xl font-bold">{shippedOrders.length}件</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">振込予定合計</p>
                <p className="text-2xl font-bold">{shippedTotalAmount.toLocaleString()}円</p>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>注文番号</TableHead>
                  <TableHead>お客様名</TableHead>
                  <TableHead className="hidden md:table-cell">振込先</TableHead>
                  <TableHead className="w-20 text-center">口座確認</TableHead>
                  <TableHead className="text-right">振込予定金額</TableHead>
                  <TableHead className="hidden sm:table-cell">申込日</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shippedLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      読み込み中...
                    </TableCell>
                  </TableRow>
                ) : shippedOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      発送済の注文はありません
                    </TableCell>
                  </TableRow>
                ) : (
                  shippedOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-sm">
                        <Link href={`/admin/orders/${order.id}`} className="text-primary hover:underline" title={order.order_number}>
                          {order.order_number.replace(/^BB-\d{8}-/, 'BB-')}
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-1.5">
                          {order.customer_name}
                          <Badge
                            variant="secondary"
                            className={`cursor-pointer text-[10px] px-1.5 py-0 ${
                              !order.customer_not_invoice_issuer
                                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                            }`}
                            onClick={() => toggleInvoiceIssuer(order.id, 'shipped')}
                            title="クリックで適格事業者の状態を切り替え"
                          >
                            {!order.customer_not_invoice_issuer ? '適格' : '非適格'}
                          </Badge>
                        </span>
                      </TableCell>
                      <TableCell className="text-sm hidden md:table-cell">
                        {order.bank_name && order.bank_branch ? (
                          <>
                            {order.bank_name} {order.bank_branch}
                            <br />
                            <span className="text-muted-foreground">
                              {order.bank_account_type} {order.bank_account_number}
                              <br />
                              {order.bank_account_holder}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">未登録</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={order.bank_verified}
                          onCheckedChange={() => toggleVerified(order.id, 'shipped')}
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {order.total_amount.toLocaleString()}円
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                        {new Date(order.created_at).toLocaleDateString('ja-JP')}
                      </TableCell>
                      <TableCell>
                        <Link href={`/admin/orders/${order.id}`}>
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
