'use client'

import { Fragment, useEffect, useState } from 'react'
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
import { Search, Eye, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getOrdersForCSV } from '@/actions/orders'
import { ORDER_STATUSES, STATUS_COLORS, ITEMS_PER_PAGE } from '@/lib/constants'
import type { Order, OrderItem, OrderStatus } from '@/types/database'

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [csvLoading, setCsvLoading] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)

  const now = new Date()
  const [csvMonth, setCsvMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  )

  const supabase = createClient()

  // Generate past 12 months options
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    return {
      value: `${y}-${String(m).padStart(2, '0')}`,
      label: `${y}年${String(m).padStart(2, '0')}月`,
    }
  })

  function escapeCSVField(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`
    }
    return value
  }

  async function handleCSVDownload() {
    setCsvLoading(true)
    try {
      const [yearStr, monthStr] = csvMonth.split('-')
      const year = parseInt(yearStr, 10)
      const month = parseInt(monthStr, 10)

      const data = await getOrdersForCSV(year, month)

      const headers = [
        '注文番号', 'ステータス', '申込日', '氏名', 'LINE名', '生年月日',
        '職業', 'メール', '電話番号', '都道府県', '住所', '本人確認方法',
        '銀行名', '支店名', '口座種別', '口座番号', '口座名義',
        '追跡番号', '発送先事務所', '商品名', '単価', '数量', '小計',
        '検品後数量', '返品数量', '見積合計', '検品後合計', '日次集計',
      ]

      // 日次集計を算出（注文単位で1回だけカウント）
      const dailyTotalMap = new Map<string, number>()
      const seenOrders = new Set<string>()
      for (const order of data ?? []) {
        if (seenOrders.has(order.id)) continue
        seenOrders.add(order.id)
        const dateKey = new Date(order.created_at).toLocaleDateString('ja-JP')
        const amount = order.inspected_total_amount ?? order.total_amount
        dailyTotalMap.set(dateKey, (dailyTotalMap.get(dateKey) ?? 0) + amount)
      }

      const rows: string[][] = []

      for (const order of data ?? []) {
        const items = (order.order_items ?? []) as OrderItem[]
        const officeName = (order.office as { name: string } | null)?.name ?? ''
        const dateKey = new Date(order.created_at).toLocaleDateString('ja-JP')

        if (items.length === 0) {
          rows.push([
            order.order_number,
            order.status,
            dateKey,
            order.customer_name,
            order.customer_line_name ?? '',
            order.customer_birth_date ?? '',
            order.customer_occupation ?? '',
            order.customer_email,
            order.customer_phone ?? '',
            order.customer_prefecture ?? '',
            order.customer_address ?? '',
            order.customer_identity_method ?? '',
            order.bank_name ?? '',
            order.bank_branch ?? '',
            order.bank_account_type ?? '',
            order.bank_account_number ?? '',
            order.bank_account_holder ?? '',
            order.tracking_number ?? '',
            officeName,
            '', '', '', '',
            '', '',
            String(order.total_amount),
            order.inspected_total_amount != null ? String(order.inspected_total_amount) : '',
            '',
          ])
        } else {
          for (const item of items) {
            const subtotal = item.unit_price * item.quantity
            rows.push([
              order.order_number,
              order.status,
              dateKey,
              order.customer_name,
              order.customer_line_name ?? '',
              order.customer_birth_date ?? '',
              order.customer_occupation ?? '',
              order.customer_email,
              order.customer_phone ?? '',
              order.customer_prefecture ?? '',
              order.customer_address ?? '',
              order.customer_identity_method ?? '',
              order.bank_name ?? '',
              order.bank_branch ?? '',
              order.bank_account_type ?? '',
              order.bank_account_number ?? '',
              order.bank_account_holder ?? '',
              order.tracking_number ?? '',
              officeName,
              item.product_name,
              String(item.unit_price),
              String(item.quantity),
              String(subtotal),
              item.inspected_quantity != null ? String(item.inspected_quantity) : '',
              item.returned_quantity != null ? String(item.returned_quantity) : '',
              String(order.total_amount),
              order.inspected_total_amount != null ? String(order.inspected_total_amount) : '',
              '',
            ])
          }
        }
      }

      // 同じ日付の最後の行にだけ日次集計を入れる（申込日は列index=2）
      const dailyColIndex = headers.length - 1
      for (let i = rows.length - 1; i >= 0; i--) {
        const dateVal = rows[i][2]
        const nextDate = i < rows.length - 1 ? rows[i + 1][2] : null
        if (dateVal !== nextDate) {
          rows[i][dailyColIndex] = String(dailyTotalMap.get(dateVal) ?? '')
        }
      }

      const csvContent =
        headers.map(escapeCSVField).join(',') +
        '\n' +
        rows.map((row) => row.map(escapeCSVField).join(',')).join('\n')

      const bom = '\uFEFF'
      const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `古物台帳_${yearStr}年${String(month).padStart(2, '0')}月.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('CSV download failed:', e)
    } finally {
      setCsvLoading(false)
    }
  }

  async function handleSummaryCSVDownload() {
    setSummaryLoading(true)
    try {
      const [yearStr, monthStr] = csvMonth.split('-')
      const year = parseInt(yearStr, 10)
      const month = parseInt(monthStr, 10)

      const data = await getOrdersForCSV(year, month)

      // お客様別に集計
      const customerMap = new Map<string, {
        name: string
        email: string
        orderCount: number
        totalAmount: number
        inspectedTotalAmount: number
        dates: string[]
      }>()

      for (const order of data ?? []) {
        const key = order.customer_email
        const existing = customerMap.get(key)
        const amount = order.inspected_total_amount ?? order.total_amount
        const date = new Date(order.created_at).toLocaleDateString('ja-JP')

        if (existing) {
          existing.orderCount++
          existing.totalAmount += order.total_amount
          existing.inspectedTotalAmount += amount
          existing.dates.push(date)
        } else {
          customerMap.set(key, {
            name: order.customer_name,
            email: order.customer_email,
            orderCount: 1,
            totalAmount: order.total_amount,
            inspectedTotalAmount: amount,
            dates: [date],
          })
        }
      }

      // 日別に集計
      const dailyMap = new Map<string, {
        date: string
        orderCount: number
        totalAmount: number
        inspectedTotalAmount: number
      }>()

      for (const order of data ?? []) {
        const dateKey = new Date(order.created_at).toLocaleDateString('ja-JP')
        const amount = order.inspected_total_amount ?? order.total_amount
        const existing = dailyMap.get(dateKey)

        if (existing) {
          existing.orderCount++
          existing.totalAmount += order.total_amount
          existing.inspectedTotalAmount += amount
        } else {
          dailyMap.set(dateKey, {
            date: dateKey,
            orderCount: 1,
            totalAmount: order.total_amount,
            inspectedTotalAmount: amount,
          })
        }
      }

      // 日別集計セクション
      const dailyHeaders = ['日付', '件数', '見積合計', '検品後合計']
      const dailyRows: string[][] = []
      let monthTotal = 0
      let monthInspected = 0
      let monthCount = 0

      // 日付順にソート
      const sortedDays = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date))
      for (const day of sortedDays) {
        dailyRows.push([
          day.date,
          String(day.orderCount),
          String(day.totalAmount),
          String(day.inspectedTotalAmount),
        ])
        monthTotal += day.totalAmount
        monthInspected += day.inspectedTotalAmount
        monthCount += day.orderCount
      }
      // 月合計行
      dailyRows.push([
        '合計',
        String(monthCount),
        String(monthTotal),
        String(monthInspected),
      ])

      // お客様別集計セクション
      const customerHeaders = [
        'お客様名', 'メール', '注文件数', '申込日',
        '見積合計', '検品後合計',
      ]

      const customerRows: string[][] = []
      for (const customer of customerMap.values()) {
        customerRows.push([
          customer.name,
          customer.email,
          String(customer.orderCount),
          customer.dates.join(' / '),
          String(customer.totalAmount),
          String(customer.inspectedTotalAmount),
        ])
      }

      // 日別集計 + 空行 + お客様別集計
      const csvContent =
        ['【日別集計】'].join(',') + '\n' +
        dailyHeaders.map(escapeCSVField).join(',') + '\n' +
        dailyRows.map((row) => row.map(escapeCSVField).join(',')).join('\n') +
        '\n\n' +
        ['【お客様別集計】'].join(',') + '\n' +
        customerHeaders.map(escapeCSVField).join(',') + '\n' +
        customerRows.map((row) => row.map(escapeCSVField).join(',')).join('\n')

      const bom = '\uFEFF'
      const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `月次集計_${yearStr}年${String(month).padStart(2, '0')}月.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Summary CSV download failed:', e)
    } finally {
      setSummaryLoading(false)
    }
  }

  async function fetchOrders() {
    setLoading(true)
    const offset = (page - 1) * ITEMS_PER_PAGE

    let query = supabase
      .from('orders')
      .select('*', { count: 'exact' })
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

    setOrders(data || [])
    setTotal(count || 0)
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

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

  // 申込日ごとの合計金額を算出
  const dailyTotals = new Map<string, { total: number; inspected: number; count: number }>()
  for (const order of orders) {
    const dateKey = new Date(order.created_at).toLocaleDateString('ja-JP')
    const existing = dailyTotals.get(dateKey)
    const amount = order.inspected_total_amount ?? order.total_amount
    if (existing) {
      existing.total += order.total_amount
      existing.inspected += amount
      existing.count++
    } else {
      dailyTotals.set(dateKey, { total: order.total_amount, inspected: amount, count: 1 })
    }
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="注文管理"
        description={`全${total}件`}
        actions={
          <>
            <Select value={csvMonth} onValueChange={setCsvMonth}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCSVDownload}
              disabled={csvLoading}
            >
              <Download className="h-4 w-4 mr-1" />
              {csvLoading ? '出力中...' : 'CSV出力'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSummaryCSVDownload}
              disabled={summaryLoading}
            >
              <Download className="h-4 w-4 mr-1" />
              {summaryLoading ? '出力中...' : '月次集計'}
            </Button>
          </>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <form onSubmit={handleSearch} className="relative flex-1 sm:max-w-sm">
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
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="全ステータス" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全ステータス</SelectItem>
            {ORDER_STATUSES.map((s) => (
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
              <TableHead className="hidden sm:table-cell">申込日</TableHead>
              <TableHead className="w-12 sm:w-16"></TableHead>
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
            ) : (
              orders.map((order, index) => {
                const dateKey = new Date(order.created_at).toLocaleDateString('ja-JP')
                const prevDateKey = index > 0
                  ? new Date(orders[index - 1].created_at).toLocaleDateString('ja-JP')
                  : null
                const isNewDate = dateKey !== prevDateKey
                const daily = dailyTotals.get(dateKey)

                return (
                  <Fragment key={order.id}>
                    {isNewDate && daily && (
                      <TableRow className="bg-muted/50">
                        <TableCell colSpan={3} className="font-semibold text-sm py-2">
                          {dateKey}（{daily.count}件）
                        </TableCell>
                        <TableCell className="text-right font-semibold text-sm py-2">
                          {daily.inspected.toLocaleString()}円
                          {daily.inspected !== daily.total && (
                            <span className="text-xs text-muted-foreground line-through ml-2">
                              {daily.total.toLocaleString()}円
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell py-2" />
                        <TableCell className="py-2" />
                      </TableRow>
                    )}
                    <TableRow>
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
                      <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                        {dateKey}
                      </TableCell>
                      <TableCell>
                        <Link href={`/admin/orders/${order.id}`}>
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  </Fragment>
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
