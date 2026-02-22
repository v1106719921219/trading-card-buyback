import Link from 'next/link'
import { AdminHeader } from '@/components/admin/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MapPin } from 'lucide-react'
import { getOfficeOrderCounts } from '@/actions/offices'
import { ORDER_STATUSES, STATUS_COLORS } from '@/lib/constants'
import type { OrderStatus } from '@/types/database'

export default async function OfficesPage() {
  const offices = await getOfficeOrderCounts()

  return (
    <div className="space-y-8">
      <AdminHeader
        title="事務所別管理"
        description="事務所ごとの注文状況を確認できます"
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {offices.map((office) => (
          <Link key={office.id} href={`/admin/offices/${office.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{office.name}</CardTitle>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {office.address}
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-3 text-sm font-medium">
                  合計: {office.total_orders}件
                </div>
                <div className="flex flex-wrap gap-2">
                  {ORDER_STATUSES.filter((s) => s !== 'キャンセル').map(
                    (status) => (
                      <div key={status} className="flex items-center gap-1">
                        <Badge
                          className={
                            STATUS_COLORS[status as OrderStatus] + ' text-xs'
                          }
                        >
                          {status}
                        </Badge>
                        <span className="text-sm font-semibold">
                          {office.status_counts[status] || 0}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
