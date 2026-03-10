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
import { ShieldCheck, Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Order } from '@/types/database'

export default function PaymentVerificationPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set())

  const supabase = createClient()

  async function fetchOrders() {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('status', '振込済')
      .order('updated_at', { ascending: true })

    if (error) {
      toast.error('データの取得に失敗しました')
      return
    }
    setOrders(data || [])
    setConfirmedIds(new Set())
    setLoading(false)
  }

  useEffect(() => {
    fetchOrders()
  }, [])

  function toggleConfirmed(id: string) {
    const next = new Set(confirmedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setConfirmedIds(next)
  }

  function toggleAll() {
    if (confirmedIds.size === orders.length) {
      setConfirmedIds(new Set())
    } else {
      setConfirmedIds(new Set(orders.map((o) => o.id)))
    }
  }

  function getAmount(order: Order): number {
    return order.inspected_total_amount ?? order.total_amount
  }

  const totalAmount = orders
    .filter((o) => confirmedIds.has(o.id))
    .reduce((sum, o) => sum + getAmount(o), 0)

  async function handleBulkVerify() {
    setProcessing(true)
    const ids = Array.from(confirmedIds)

    for (const id of ids) {
      const { error } = await supabase
        .from('orders')
        .update({ status: '振込確認済' })
        .eq('id', id)

      if (error) {
        toast.error(`確認処理に失敗しました: ${error.message}`)
        setProcessing(false)
        fetchOrders()
        return
      }
    }

    toast.success(`${ids.length}件の振込確認を完了しました`)
    setProcessing(false)
    fetchOrders()
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="振込確認"
        description="銀行の振込履歴を見ながら、振込金額が正しいか確認してください"
      />

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">確認待ち</p>
            <p className="text-2xl font-bold">{orders.length}件</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">確認済チェック</p>
            <p className="text-2xl font-bold">{confirmedIds.size}件</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">確認済合計</p>
            <p className="text-2xl font-bold">{totalAmount.toLocaleString()}円</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      {confirmedIds.size > 0 && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={processing}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              {confirmedIds.size}件を振込確認済にする
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>振込確認を完了しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmedIds.size}件（合計 {totalAmount.toLocaleString()}円）を「振込確認済」に変更します。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkVerify}>
                確認済にする
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={orders.length > 0 && confirmedIds.size === orders.length}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead>注文番号</TableHead>
              <TableHead>お客様名</TableHead>
              <TableHead>振込先</TableHead>
              <TableHead className="text-right">振込金額</TableHead>
              <TableHead>振込日</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  読み込み中...
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  確認待ちの注文はありません
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Checkbox
                      checked={confirmedIds.has(order.id)}
                      onCheckedChange={() => toggleConfirmed(order.id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    <Link href={`/admin/orders/${order.id}`} className="text-primary hover:underline">
                      {order.order_number}
                    </Link>
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
                  <TableCell className="text-right font-medium">
                    {getAmount(order).toLocaleString()}円
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
