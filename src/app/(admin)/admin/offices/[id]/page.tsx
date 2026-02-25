'use client'

import { Fragment, useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
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
import { Search, Eye, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ORDER_STATUSES, STATUS_COLORS, ITEMS_PER_PAGE } from '@/lib/constants'
import { extractPrefectureFromAddress, getDeliveryDays, calculateArrivalDate, formatDateJST } from '@/lib/delivery'
import type { Order, Office, OrderStatus } from '@/types/database'

export default function OfficeOrdersPage() {
  const params = useParams()
  const officeId = params.id as string

  const [office, setOffice] = useState<Office | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)

  // 到着日計算用
  const [shippedAtMap, setShippedAtMap] = useState<Map<string, string>>(new Map())

  const supabase = createClient()

  useEffect(() => {
    async function fetchOffice() {
      const { data } = await supabase
        .from('offices')
        .select('*')
        .eq('id', officeId)
        .single()
      setOffice(data)
    }
    fetchOffice()
  }, [officeId])

  async function fetchOrders() {
    setLoading(true)
    const offset = (page - 1) * ITEMS_PER_PAGE

    const excludedStatuses = ['キャンセル', '振込済', '振込確認済']

    let query = supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .eq('office_id', officeId)
      .not('status', 'in', `(${excludedStatuses.join(',')})`)
      .order('created_at', { ascending: false })
      .range(offset, offset + ITEMS_PER_PAGE - 1)

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    if (search) {
      query = query.or(
        `order_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%`
      )
    }

    const { data, count, error } = await query
    if (error) {
      console.error(error)
      setLoading(false)
      return
    }

    const fetchedOrders = data || []
    setOrders(fetchedOrders)
    setTotal(count || 0)

    // 発送済注文の発送日を取得
    const shippedOrderIds = fetchedOrders
      .filter((o) => o.status === '発送済')
      .map((o) => o.id)

    if (shippedOrderIds.length > 0) {
      const { data: histories } = await supabase
        .from('order_status_history')
        .select('order_id, changed_at')
        .in('order_id', shippedOrderIds)
        .eq('new_status', '発送済')

      const map = new Map<string, string>()
      if (histories) {
        for (const h of histories) {
          const existing = map.get(h.order_id)
          if (!existing || h.changed_at > existing) {
            map.set(h.order_id, h.changed_at)
          }
        }
      }
      setShippedAtMap(map)
    } else {
      setShippedAtMap(new Map())
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchOrders()
  }, [statusFilter, search, page, officeId])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput)
  }

  // 到着日を計算（shipped_date を優先、なければステータス変更日をフォールバック）
  function getArrivalDate(order: Order): string | null {
    if (order.status !== '発送済') return null
    const shippedAt = order.shipped_date || shippedAtMap.get(order.id)
    if (!shippedAt || !office) return null

    const customerPref = order.customer_prefecture
    const officePref = extractPrefectureFromAddress(office.address)
    if (!customerPref || !officePref) return null

    const days = getDeliveryDays(customerPref, officePref)
    const arrival = calculateArrivalDate(new Date(shippedAt), days)
    return formatDateJST(arrival)
  }

  // 到着日でグルーピング
  const groupedOrders = useMemo(() => {
    const todayStr = formatDateJST(new Date())
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = formatDateJST(tomorrow)

    const groups = new Map<string, { label: string; orders: Order[] }>()

    // 発送済でない注文をステータス別にグルーピング
    const nonShipped = orders.filter((o) => o.status !== '発送済')
    const shipped = orders.filter((o) => o.status === '発送済')

    // 発送済注文を到着日でグルーピング
    for (const order of shipped) {
      const arrivalDate = getArrivalDate(order)
      const key = arrivalDate || 'unknown'

      if (!groups.has(key)) {
        let label: string
        if (key === 'unknown') {
          label = '到着日不明'
        } else if (key === todayStr) {
          label = `${key}（本日到着予定）`
        } else if (key === tomorrowStr) {
          label = `${key}（明日到着予定）`
        } else if (key < todayStr) {
          label = `${key}（遅延の可能性）`
        } else {
          label = `${key} 到着予定`
        }
        groups.set(key, { label, orders: [] })
      }
      groups.get(key)!.orders.push(order)
    }

    // 日付でソート（unknown は最後）
    const sortedKeys = [...groups.keys()]
      .filter((k) => k !== 'unknown')
      .sort()
    if (groups.has('unknown')) {
      sortedKeys.push('unknown')
    }

    const result: { key: string; label: string; orders: Order[] }[] = []
    for (const key of sortedKeys) {
      const group = groups.get(key)!
      result.push({ key, label: group.label, orders: group.orders })
    }

    // 発送済以外の注文をまとめて最後に追加
    if (nonShipped.length > 0) {
      result.push({ key: 'other', label: 'その他のステータス', orders: nonShipped })
    }

    return result
  }, [orders, shippedAtMap, office])

  // 発送済フィルタ時のみグルーピング表示
  const showGrouped = orders.some((o) => o.status === '発送済')

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

  function renderOrderRow(order: Order) {
    return (
      <TableRow key={order.id}>
        <TableCell className="font-mono text-sm">
          <Link href={`/admin/orders/${order.id}`} className="text-primary hover:underline" title={order.order_number}>
            {order.order_number.replace(/^BB-\d{8}-/, 'BB-')}
          </Link>
        </TableCell>
        <TableCell>
          <Badge className={STATUS_COLORS[order.status as OrderStatus]}>
            {order.status}
          </Badge>
        </TableCell>
        <TableCell>{order.customer_name}</TableCell>
        <TableCell className="text-right">
          {order.inspected_total_amount != null ? (
            <div>
              <span className="font-medium">
                {order.inspected_total_amount.toLocaleString()}円
              </span>
              {order.inspected_total_amount !== order.total_amount && (
                <span className="text-xs text-muted-foreground line-through ml-2">
                  {order.total_amount.toLocaleString()}円
                </span>
              )}
            </div>
          ) : (
            <span>{order.total_amount.toLocaleString()}円</span>
          )}
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
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
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/offices">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            戻る
          </Button>
        </Link>
      </div>

      <AdminHeader
        title={office ? `${office.name} の注文一覧` : '読み込み中...'}
        description={`全${total}件`}
      />

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <form onSubmit={handleSearch} className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="注文番号・お名前・メールで検索..."
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
          <SelectTrigger className="w-40">
            <SelectValue placeholder="全ステータス" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全ステータス</SelectItem>
            {ORDER_STATUSES.filter((s) => !['キャンセル', '振込済', '振込確認済'].includes(s)).map((s) => (
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
              <TableHead>ステータス</TableHead>
              <TableHead>お客様名</TableHead>
              <TableHead className="text-right">合計金額</TableHead>
              <TableHead>申込日</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  読み込み中...
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  注文がありません
                </TableCell>
              </TableRow>
            ) : showGrouped ? (
              groupedOrders.map((group) => (
                <Fragment key={group.key}>
                  <TableRow>
                    <TableCell colSpan={6} className="bg-muted/50 py-2 px-4 font-medium text-sm">
                      {group.label}
                      <span className="text-muted-foreground font-normal ml-2">
                        （{group.orders.length}件）
                      </span>
                    </TableCell>
                  </TableRow>
                  {group.orders.map(renderOrderRow)}
                </Fragment>
              ))
            ) : (
              orders.map(renderOrderRow)
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
