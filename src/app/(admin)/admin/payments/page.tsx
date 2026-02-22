'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminHeader } from '@/components/admin/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { CreditCard, Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { bulkMarkAsPaid } from '@/actions/payments'
import type { Order } from '@/types/database'

export default function PaymentsPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set())
  const [processing, setProcessing] = useState(false)

  const supabase = createClient()

  async function fetchOrders() {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('status', '検品完了')
      .order('updated_at', { ascending: true })

    if (error) {
      toast.error('データの取得に失敗しました')
      return
    }
    setOrders(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchOrders()
  }, [])

  function toggleSelect(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  function toggleVerified(id: string) {
    const next = new Set(verifiedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setVerifiedIds(next)
  }

  function toggleAll() {
    if (selectedIds.size === orders.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(orders.map((o) => o.id)))
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

    toast.success(`${ids.length}件の振込を処理しました（お客様にメール通知済み）`)
    setSelectedIds(new Set())
    setProcessing(false)
    fetchOrders()
  }

  const unverifiedSelected = [...selectedIds].filter((id) => !verifiedIds.has(id))

  const totalAmount = orders
    .filter((o) => selectedIds.has(o.id))
    .reduce((sum, o) => sum + (o.inspected_total_amount ?? o.total_amount), 0)

  return (
    <div className="space-y-6">
      <AdminHeader
        title="振込管理"
        description="検品完了した注文の振込処理"
      />

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
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
              <TableHead>振込先</TableHead>
              <TableHead className="w-20 text-center">口座確認</TableHead>
              <TableHead className="text-right">振込金額</TableHead>
              <TableHead>検品完了日</TableHead>
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
                    {order.order_number}
                  </TableCell>
                  <TableCell>{order.customer_name}</TableCell>
                  <TableCell className="text-sm">
                    {order.bank_name} {order.bank_branch}
                    <br />
                    <span className="text-muted-foreground">
                      {order.bank_account_type} {order.bank_account_number}
                      <br />
                      <span className="text-muted-foreground">{order.bank_account_holder}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={verifiedIds.has(order.id)}
                      onCheckedChange={() => toggleVerified(order.id)}
                    />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {(order.inspected_total_amount ?? order.total_amount).toLocaleString()}円
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
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
    </div>
  )
}
