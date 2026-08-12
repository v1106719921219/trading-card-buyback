import { createClient } from '@/lib/supabase/server'
import { AdminHeader } from '@/components/admin/header'

export const dynamic = 'force-dynamic'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table'
import { ShoppingCart, Package, CreditCard, CheckCircle } from 'lucide-react'
import { ORDER_STATUSES, STATUS_COLORS } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import type { OrderStatus } from '@/types/database'

export default async function AdminDashboard() {
  const supabase = await createClient()

  // Get order counts by status
  const { data: orders } = await supabase
    .from('orders')
    .select('status')

  const statusCounts: Record<string, number> = {}
  ORDER_STATUSES.forEach((s) => (statusCounts[s] = 0))
  orders?.forEach((o) => {
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1
  })

  // Get today's stats
  const today = new Date().toISOString().split('T')[0]
  const { count: todayOrders } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', `${today}T00:00:00`)

  // Get transfer history from order_status_history (when status changed to 振込済)
  // joined with order amounts
  const { data: transferHistory } = await supabase
    .from('order_status_history')
    .select('order_id, changed_at, orders(inspected_total_amount, total_amount, inspection_discount)')
    .eq('new_status', '振込済')
    .order('changed_at', { ascending: false })

  // Aggregate by day
  const dailyTotals: Record<string, { amount: number; count: number }> = {}
  transferHistory?.forEach((h) => {
    const order = h.orders as unknown as { inspected_total_amount: number | null; total_amount: number | null; inspection_discount: number | null } | null
    if (!order) return
    const date = new Date(h.changed_at).toISOString().split('T')[0]
    const amount = ((order.inspected_total_amount ?? order.total_amount) || 0) - (order.inspection_discount || 0)
    if (!dailyTotals[date]) dailyTotals[date] = { amount: 0, count: 0 }
    dailyTotals[date].amount += amount
    dailyTotals[date].count += 1
  })

  const dailyEntries = Object.entries(dailyTotals)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 30)

  // Aggregate by month
  const monthlyTotals: Record<string, { amount: number; count: number }> = {}
  transferHistory?.forEach((h) => {
    const order = h.orders as unknown as { inspected_total_amount: number | null; total_amount: number | null; inspection_discount: number | null } | null
    if (!order) return
    const month = new Date(h.changed_at).toISOString().slice(0, 7) // YYYY-MM
    const amount = ((order.inspected_total_amount ?? order.total_amount) || 0) - (order.inspection_discount || 0)
    if (!monthlyTotals[month]) monthlyTotals[month] = { amount: 0, count: 0 }
    monthlyTotals[month].amount += amount
    monthlyTotals[month].count += 1
  })

  const monthlyEntries = Object.entries(monthlyTotals)
    .sort(([a], [b]) => b.localeCompare(a))

  // Today's total (from daily aggregation)
  const todayTotalAmount = dailyTotals[today]?.amount || 0

  const totalActive = orders?.filter(
    (o) => o.status !== '振込済' && o.status !== 'キャンセル'
  ).length || 0

  return (
    <div className="space-y-8">
      <AdminHeader title="ダッシュボード" description="買取業務の概要" />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">本日の申込</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayOrders || 0}件</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">処理中</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalActive}件</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">検品待ち</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(statusCounts['発送済'] || 0)}件
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">本日の振込額</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {todayTotalAmount.toLocaleString()}円
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle>ステータス別件数</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {ORDER_STATUSES.filter((s) => s !== 'キャンセル').map((status) => (
              <div key={status} className="flex items-center gap-2">
                <Badge className={STATUS_COLORS[status as OrderStatus]}>
                  {status}
                </Badge>
                <span className="text-lg font-semibold">
                  {statusCounts[status] || 0}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Daily & Monthly Transfer Summaries */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Daily */}
        <Card>
          <CardHeader>
            <CardTitle>日別振込金額</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日付</TableHead>
                  <TableHead className="text-right">件数</TableHead>
                  <TableHead className="text-right">振込金額</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dailyEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      データなし
                    </TableCell>
                  </TableRow>
                ) : (
                  dailyEntries.map(([date, { amount, count }]) => (
                    <TableRow key={date} className={date === today ? 'bg-muted/50 font-medium' : ''}>
                      <TableCell>{date}</TableCell>
                      <TableCell className="text-right">{count}件</TableCell>
                      <TableCell className="text-right">{amount.toLocaleString()}円</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {dailyEntries.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell>合計</TableCell>
                    <TableCell className="text-right">
                      {dailyEntries.reduce((s, [, d]) => s + d.count, 0)}件
                    </TableCell>
                    <TableCell className="text-right">
                      {dailyEntries.reduce((s, [, d]) => s + d.amount, 0).toLocaleString()}円
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </CardContent>
        </Card>

        {/* Monthly */}
        <Card>
          <CardHeader>
            <CardTitle>月別振込金額</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>月</TableHead>
                  <TableHead className="text-right">件数</TableHead>
                  <TableHead className="text-right">振込金額</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      データなし
                    </TableCell>
                  </TableRow>
                ) : (
                  monthlyEntries.map(([month, { amount, count }]) => (
                    <TableRow key={month}>
                      <TableCell>{month}</TableCell>
                      <TableCell className="text-right">{count}件</TableCell>
                      <TableCell className="text-right">{amount.toLocaleString()}円</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {monthlyEntries.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell>合計</TableCell>
                    <TableCell className="text-right">
                      {monthlyEntries.reduce((s, [, d]) => s + d.count, 0)}件
                    </TableCell>
                    <TableCell className="text-right">
                      {monthlyEntries.reduce((s, [, d]) => s + d.amount, 0).toLocaleString()}円
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
