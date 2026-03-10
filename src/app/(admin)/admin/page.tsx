import { createClient } from '@/lib/supabase/server'
import { AdminHeader } from '@/components/admin/header'

export const dynamic = 'force-dynamic'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

  const { data: todayCompleted } = await supabase
    .from('orders')
    .select('inspected_total_amount')
    .eq('status', '振込済')
    .gte('updated_at', `${today}T00:00:00`)

  const todayTotalAmount = todayCompleted?.reduce(
    (sum, o) => sum + (o.inspected_total_amount || 0),
    0
  ) || 0

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
    </div>
  )
}
