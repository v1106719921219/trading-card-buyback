'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AdminHeader } from '@/components/admin/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowLeft, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Order, OrderItem, Product } from '@/types/database'

type VerifyItem = OrderItem & {
  masterProduct?: Product | null
  issues: string[]
}

export default function VerifyPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.id as string

  const [order, setOrder] = useState<Order | null>(null)
  const [verifyItems, setVerifyItems] = useState<VerifyItem[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      // Fetch order with items
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', orderId)
        .single()

      if (orderError || !orderData) {
        toast.error('注文が見つかりません')
        router.push('/admin/orders')
        return
      }

      const ord = orderData as Order
      setOrder(ord)

      const items = ord.order_items || []

      // Fetch product master data for items that have product_id
      const productIds = items
        .map((item) => item.product_id)
        .filter((id): id is string => id != null)

      let productsMap: Record<string, Product> = {}
      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from('products')
          .select('*')
          .in('id', productIds)

        if (products) {
          productsMap = Object.fromEntries(
            products.map((p) => [p.id, p as Product])
          )
        }
      }

      // Build verify items with issue detection
      const verified: VerifyItem[] = items.map((item) => {
        const master = item.product_id ? productsMap[item.product_id] || null : null
        const issues: string[] = []

        // Check 1: Quantity reduction
        if (
          item.inspected_quantity != null &&
          item.inspected_quantity < item.quantity
        ) {
          issues.push(
            `数量減: ${item.quantity} → ${item.inspected_quantity}（-${item.quantity - item.inspected_quantity}）`
          )
        }

        // Check 2: Price mismatch with product master
        if (master && item.unit_price !== master.price) {
          issues.push(
            `単価不一致: 注文時 ${item.unit_price.toLocaleString()}円 / 現在マスタ ${master.price.toLocaleString()}円`
          )
        }

        // Check 3: Product name mismatch
        if (master && item.product_name !== master.name) {
          issues.push(
            `商品名不一致: 「${item.product_name}」≠ マスタ「${master.name}」`
          )
        }

        // Check 4: No product_id linked
        if (!item.product_id) {
          issues.push('商品マスタ未紐付け')
        }

        // Check 5: Quantity increase (unusual)
        if (
          item.inspected_quantity != null &&
          item.inspected_quantity > item.quantity
        ) {
          issues.push(
            `数量増: ${item.quantity} → ${item.inspected_quantity}（+${item.inspected_quantity - item.quantity}）`
          )
        }

        return { ...item, masterProduct: master, issues }
      })

      setVerifyItems(verified)
      setLoading(false)
    }

    fetchData()
  }, [orderId])

  if (loading || !order) {
    return (
      <div className="p-8 text-center text-muted-foreground">読み込み中...</div>
    )
  }

  const hasInspection = verifyItems.some((i) => i.inspected_quantity != null)
  const totalIssues = verifyItems.reduce((sum, i) => sum + i.issues.length, 0)
  const itemsWithIssues = verifyItems.filter((i) => i.issues.length > 0).length

  const declaredTotal = verifyItems.reduce(
    (sum, i) => sum + i.unit_price * i.quantity,
    0
  )
  const inspectedTotal = hasInspection
    ? verifyItems.reduce(
        (sum, i) => sum + i.unit_price * (i.inspected_quantity ?? i.quantity),
        0
      )
    : null
  const reduction =
    inspectedTotal != null ? inspectedTotal - declaredTotal : null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/admin/orders/${orderId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <AdminHeader
          title={`検品確認 - ${order.order_number}`}
          description={`${order.customer_name} 様`}
        />
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">申告合計</p>
            <p className="text-2xl font-bold">
              {declaredTotal.toLocaleString()}円
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">検品後合計</p>
            <p className="text-2xl font-bold">
              {inspectedTotal != null
                ? `${inspectedTotal.toLocaleString()}円`
                : '未検品'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">差額</p>
            <p
              className={`text-2xl font-bold ${
                reduction != null && reduction < 0
                  ? 'text-destructive'
                  : reduction != null && reduction > 0
                    ? 'text-green-600'
                    : ''
              }`}
            >
              {reduction != null
                ? `${reduction > 0 ? '+' : ''}${reduction.toLocaleString()}円`
                : '-'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">指摘事項</p>
            <div className="flex items-center gap-2">
              {totalIssues > 0 ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  <p className="text-2xl font-bold text-yellow-600">
                    {itemsWithIssues}件 / {verifyItems.length}商品
                  </p>
                </>
              ) : (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <p className="text-2xl font-bold text-green-600">問題なし</p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detail table */}
      <Card>
        <CardHeader>
          <CardTitle>明細チェック</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>商品名</TableHead>
                <TableHead>マスタ商品名</TableHead>
                <TableHead className="text-right">単価</TableHead>
                <TableHead className="text-right">マスタ単価</TableHead>
                <TableHead className="text-right">申告数量</TableHead>
                <TableHead className="text-right">検品数量</TableHead>
                <TableHead className="text-right">差異</TableHead>
                <TableHead className="text-right">検品後小計</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {verifyItems.map((item) => {
                const hasIssue = item.issues.length > 0
                const qtyDiff =
                  item.inspected_quantity != null
                    ? item.inspected_quantity - item.quantity
                    : null
                const nameMatch =
                  item.masterProduct &&
                  item.product_name === item.masterProduct.name
                const priceMatch =
                  item.masterProduct &&
                  item.unit_price === item.masterProduct.price

                return (
                  <TableRow
                    key={item.id}
                    className={hasIssue ? 'bg-yellow-50' : ''}
                  >
                    <TableCell>
                      {hasIssue ? (
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      ) : (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {item.product_name}
                    </TableCell>
                    <TableCell>
                      {item.masterProduct ? (
                        <span
                          className={
                            nameMatch
                              ? 'text-green-700'
                              : 'text-destructive font-medium'
                          }
                        >
                          {item.masterProduct.name}
                          {!nameMatch && (
                            <XCircle className="inline ml-1 h-3 w-3" />
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          未紐付け
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.unit_price.toLocaleString()}円
                    </TableCell>
                    <TableCell className="text-right">
                      {item.masterProduct ? (
                        <span
                          className={
                            priceMatch
                              ? ''
                              : 'text-destructive font-medium'
                          }
                        >
                          {item.masterProduct.price.toLocaleString()}円
                          {!priceMatch && (
                            <XCircle className="inline ml-1 h-3 w-3" />
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">
                      {item.inspected_quantity != null ? (
                        <span
                          className={
                            item.inspected_quantity !== item.quantity
                              ? 'text-destructive font-medium'
                              : ''
                          }
                        >
                          {item.inspected_quantity}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {qtyDiff != null && qtyDiff !== 0 && (
                        <Badge
                          variant={qtyDiff < 0 ? 'destructive' : 'default'}
                        >
                          {qtyDiff > 0 ? `+${qtyDiff}` : qtyDiff}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {(
                        item.unit_price *
                        (item.inspected_quantity ?? item.quantity)
                      ).toLocaleString()}
                      円
                    </TableCell>
                  </TableRow>
                )
              })}
              <TableRow>
                <TableCell colSpan={8} className="text-right font-bold">
                  合計
                </TableCell>
                <TableCell className="text-right font-bold text-lg">
                  {(inspectedTotal ?? declaredTotal).toLocaleString()}円
                </TableCell>
              </TableRow>
              {reduction != null && reduction !== 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-right text-sm text-muted-foreground">
                    申告時合計
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground line-through">
                    {declaredTotal.toLocaleString()}円
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Issues detail */}
      {totalIssues > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              指摘事項一覧
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {verifyItems
                .filter((item) => item.issues.length > 0)
                .map((item) => (
                  <div key={item.id} className="rounded-md border p-3">
                    <p className="font-medium text-sm mb-1">
                      {item.product_name}
                    </p>
                    <ul className="space-y-1">
                      {item.issues.map((issue, idx) => (
                        <li
                          key={idx}
                          className="text-sm text-yellow-700 flex items-center gap-2"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0" />
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
