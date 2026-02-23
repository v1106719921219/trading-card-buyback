'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminHeader } from '@/components/admin/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, ChevronLeft, ChevronRight, PackageCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { RETURN_STATUSES, RETURN_STATUS_COLORS, ITEMS_PER_PAGE } from '@/lib/constants'
import type { Office, Order, OrderItem, ReturnStatus } from '@/types/database'

type OrderWithItems = Order & { order_items: OrderItem[]; office: Office | null }

export default function ReturnsPage() {
  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [trackingNumbers, setTrackingNumbers] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const supabase = createClient()

  async function fetchOrders() {
    setLoading(true)
    const offset = (page - 1) * ITEMS_PER_PAGE

    let query = supabase
      .from('orders')
      .select('*, order_items(*), office:offices(*)', { count: 'exact' })
      .not('return_status', 'is', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + ITEMS_PER_PAGE - 1)

    if (statusFilter !== 'all') {
      query = query.eq('return_status', statusFilter)
    }

    if (search) {
      query = query.or(
        `order_number.ilike.%${search}%,customer_name.ilike.%${search}%`
      )
    }

    const { data, count, error } = await query
    if (error) {
      console.error(error)
      setLoading(false)
      return
    }

    const ordersData = (data || []) as OrderWithItems[]
    setOrders(ordersData)
    setTotal(count || 0)

    // Initialize tracking numbers from existing data
    const numbers: Record<string, string> = {}
    for (const order of ordersData) {
      numbers[order.id] = order.return_tracking_number || ''
    }
    setTrackingNumbers((prev) => ({ ...prev, ...numbers }))
    setLoading(false)
  }

  useEffect(() => {
    fetchOrders()
  }, [statusFilter, search, page])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput)
  }

  function getReturnedItems(order: OrderWithItems): OrderItem[] {
    return (order.order_items || []).filter(
      (item) => item.returned_quantity && item.returned_quantity > 0
    )
  }

  async function handleMarkReturned(orderId: string) {
    const trackingNumber = trackingNumbers[orderId]?.trim()
    if (!trackingNumber) {
      const { toast } = await import('sonner')
      toast.error('返送追跡番号を入力してください')
      return
    }

    setSavingId(orderId)
    const { error } = await supabase
      .from('orders')
      .update({
        return_status: '返送済',
        return_tracking_number: trackingNumber,
      })
      .eq('id', orderId)

    const { toast } = await import('sonner')
    if (error) {
      toast.error('更新に失敗しました')
    } else {
      toast.success('返送済に更新しました')
      fetchOrders()
    }
    setSavingId(null)
  }

  async function handleSaveTracking(orderId: string) {
    const trackingNumber = trackingNumbers[orderId]?.trim() || null

    setSavingId(orderId)
    const { error } = await supabase
      .from('orders')
      .update({ return_tracking_number: trackingNumber })
      .eq('id', orderId)

    const { toast } = await import('sonner')
    if (error) {
      toast.error('追跡番号の保存に失敗しました')
    } else {
      toast.success('追跡番号を保存しました')
    }
    setSavingId(null)
  }

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

  return (
    <div className="space-y-6">
      <AdminHeader title="返品管理" description={`全${total}件`} />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <form onSubmit={handleSearch} className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="注文番号・お客様名で検索..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </form>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="全ステータス" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全ステータス</SelectItem>
            {RETURN_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>注文番号</TableHead>
              <TableHead>お客様名</TableHead>
              <TableHead className="hidden md:table-cell">事務所</TableHead>
              <TableHead className="hidden lg:table-cell">住所</TableHead>
              <TableHead className="hidden sm:table-cell">返品商品</TableHead>
              <TableHead>ステータス</TableHead>
              <TableHead>追跡番号</TableHead>
              <TableHead className="w-28 sm:w-36">操作</TableHead>
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
                  返品のある注文がありません
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => {
                const returnedItems = getReturnedItems(order)
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm">
                      <Link href={`/admin/orders/${order.id}`} className="text-primary hover:underline">
                        {order.order_number}
                      </Link>
                    </TableCell>
                    <TableCell>{order.customer_name}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {order.office ? (
                        <Badge variant="outline">{order.office.name}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm max-w-48 truncate hidden lg:table-cell">
                      {order.customer_address || '-'}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="space-y-1">
                        {returnedItems.map((item) => (
                          <div key={item.id} className="text-sm">
                            {item.product_name} x{item.returned_quantity}
                          </div>
                        ))}
                        {returnedItems.length === 0 && (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={RETURN_STATUS_COLORS[order.return_status as ReturnStatus]}>
                        {order.return_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Input
                          value={trackingNumbers[order.id] || ''}
                          onChange={(e) =>
                            setTrackingNumbers((prev) => ({
                              ...prev,
                              [order.id]: e.target.value,
                            }))
                          }
                          placeholder="追跡番号"
                          className="w-28 sm:w-40 text-sm"
                          disabled={order.return_status === '返送済'}
                        />
                        {order.return_status !== '返送済' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSaveTracking(order.id)}
                            disabled={savingId === order.id}
                          >
                            保存
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {order.return_status === '返送待ち' && (
                        <Button
                          size="sm"
                          onClick={() => handleMarkReturned(order.id)}
                          disabled={savingId === order.id}
                        >
                          <PackageCheck className="mr-1 h-4 w-4" />
                          返送済にする
                        </Button>
                      )}
                      {order.return_status === '返送済' && (
                        <span className="text-sm text-muted-foreground">返送完了</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {(page - 1) * ITEMS_PER_PAGE + 1}-{Math.min(page * ITEMS_PER_PAGE, total)} / {total}件
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
